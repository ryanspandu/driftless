import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Category from '#modules/ecommerce/models/category'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import ProductImportService from '#modules/ecommerce/services/import_service'
import { csvParse, csvDocument } from '#modules/ecommerce/services/csv'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/** Build a CSV document from a header + rows, exactly as an operator's file would look. */
function csv(header: string[], rows: unknown[][]): string {
  return csvDocument(header, rows)
}

async function runImport(text: string) {
  return new ProductImportService().import(text, null)
}

test.group('E-commerce | CSV parse', () => {
  test('reads quoted fields with embedded commas, quotes and newlines', ({ assert }) => {
    const text = 'a,b,c\r\n"x,y","he said ""hi""","line1\nline2"\r\n'
    const rows = csvParse(text)
    assert.deepEqual(rows, [
      ['a', 'b', 'c'],
      ['x,y', 'he said "hi"', 'line1\nline2'],
    ])
  })

  test('strips a leading BOM and tolerates both line endings', ({ assert }) => {
    const text = '﻿a,b\nc,d\r\ne,f'
    assert.deepEqual(csvParse(text), [
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ])
  })

  test('drops fully blank lines but keeps empty cells', ({ assert }) => {
    const text = 'a,b\r\n\r\n,\r\n'
    assert.deepEqual(csvParse(text), [
      ['a', 'b'],
      ['', ''],
    ])
  })

  test('round-trips what the writer produced', ({ assert }) => {
    const doc = csvDocument(['title', 'note'], [['Widget, deluxe', 'a "quoted" note']])
    assert.deepEqual(csvParse(doc), [
      ['title', 'note'],
      ['Widget, deluxe', 'a "quoted" note'],
    ])
  })
})

test.group('E-commerce | product import', (group) => {
  group.each.setup(async () => resetDatabase())

  test('creates a new product and variant from one row', async ({ assert }) => {
    const text = csv(
      ['title', 'status', 'variant', 'sku', 'price', 'stock_on_hand'],
      [['Merino jumper', 'active', 'Large', 'MER-L', '19.99', '10']]
    )
    const result = await runImport(text)

    assert.equal(result.created, 1)
    assert.equal(result.updated, 0)
    assert.equal(result.errors.length, 0)

    const product = await Product.query().where('slug', 'merino-jumper').firstOrFail()
    assert.equal(product.status, 'active')
    const variant = await ProductVariant.query().where('product_id', product.id).firstOrFail()
    // "19.99" in a 2-decimal currency lands as exactly 1999 minor units.
    assert.strictEqual(variant.priceAmount, 1999)
    assert.equal(variant.sku, 'MER-L')
    assert.strictEqual(variant.stockOnHand, 10)
  })

  test('accepts price_minor (cents) as well as price (dollars)', async ({ assert }) => {
    const text = csv(['title', 'variant', 'price_minor'], [['Cents product', 'Default', '2500']])
    await runImport(text)

    const product = await Product.query().where('slug', 'cents-product').firstOrFail()
    const variant = await ProductVariant.query().where('product_id', product.id).firstOrFail()
    assert.strictEqual(variant.priceAmount, 2500)
  })

  test('groups multiple rows into one product with several variants', async ({ assert }) => {
    const text = csv(
      ['title', 'slug', 'variant', 'sku', 'price'],
      [
        ['Tee', 'tee', 'Small', 'TEE-S', '10.00'],
        ['Tee', 'tee', 'Medium', 'TEE-M', '10.00'],
        ['Tee', 'tee', 'Large', 'TEE-L', '12.00'],
      ]
    )
    const result = await runImport(text)

    assert.equal(result.created, 1)
    const product = await Product.query().where('slug', 'tee').firstOrFail()
    const variants = await ProductVariant.query().where('product_id', product.id)
    assert.equal(variants.length, 3)
  })

  test('upserts by slug and variant by sku rather than duplicating', async ({ assert }) => {
    const first = csv(
      ['title', 'slug', 'variant', 'sku', 'price', 'status'],
      [['Kettle', 'kettle', 'Default', 'KET-1', '30.00', 'draft']]
    )
    await runImport(first)

    const second = csv(
      ['title', 'slug', 'variant', 'sku', 'price', 'status'],
      [['Kettle renamed', 'kettle', 'Default', 'KET-1', '35.00', 'active']]
    )
    const result = await runImport(second)

    assert.equal(result.created, 0)
    assert.equal(result.updated, 1)

    const products = await Product.query().where('slug', 'kettle')
    assert.equal(products.length, 1, 'no duplicate product')
    assert.equal(products[0].title, 'Kettle renamed')
    assert.equal(products[0].status, 'active')

    const variants = await ProductVariant.query().where('product_id', products[0].id)
    assert.equal(variants.length, 1, 'no duplicate variant')
    assert.strictEqual(variants[0].priceAmount, 3500)
  })

  test('imports an affiliate product with an external CTA and a default variant', async ({
    assert,
  }) => {
    const text = csv(
      ['title', 'cta_mode', 'external_url', 'external_label', 'variant', 'price'],
      [['Affiliate widget', 'external', 'https://example.com/buy', 'Buy on Example', 'Default', '']]
    )
    const result = await runImport(text)

    assert.equal(result.created, 1)
    assert.equal(result.errors.length, 0)

    const product = await Product.query().where('slug', 'affiliate-widget').firstOrFail()
    assert.equal(product.ctaMode, 'external')
    assert.equal(product.externalUrl, 'https://example.com/buy')
    assert.equal(product.externalLabel, 'Buy on Example')

    // A variant exists (price 0) so the storefront renders the product at all,
    // and inventory is off since buying happens elsewhere.
    const variant = await ProductVariant.query().where('product_id', product.id).firstOrFail()
    assert.strictEqual(variant.priceAmount, 0)
    assert.isFalse(variant.trackInventory)
  })

  test('rejects an external CTA with no URL, reporting the row', async ({ assert }) => {
    const text = csv(
      ['title', 'cta_mode', 'variant', 'price'],
      [['Broken affiliate', 'external', 'Default', '0']]
    )
    const result = await runImport(text)

    assert.equal(result.created, 0)
    assert.equal(result.skipped, 1)
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].row, 2)
  })

  test('resolves categories by name, auto-creating the missing ones', async ({ assert }) => {
    const text = csv(
      ['title', 'categories', 'variant', 'price'],
      [['Tent', 'Outdoor, Camping', 'Default', '99.00']]
    )
    await runImport(text)

    const outdoor = await Category.query().where('name', 'Outdoor').firstOrFail()
    const camping = await Category.query().where('name', 'Camping').firstOrFail()

    const product = await Product.query().where('slug', 'tent').firstOrFail()
    const dto = await new CatalogService().find(product.id)
    assert.includeMembers(dto.categoryIds, [outdoor.id, camping.id])
  })

  test('is best-effort: a bad row is reported but valid rows still import', async ({ assert }) => {
    const text = csv(
      ['title', 'slug', 'variant', 'price', 'type'],
      [
        ['Good one', 'good-one', 'Default', '5.00', 'physical'],
        ['Bad type', 'bad-type', 'Default', '5.00', 'nonsense'],
        ['Another good', 'another-good', 'Default', '7.00', 'digital'],
      ]
    )
    const result = await runImport(text)

    assert.equal(result.created, 2)
    assert.equal(result.skipped, 1)
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].row, 3, 'the bad row is line 3')

    assert.isNotNull(await Product.query().where('slug', 'good-one').first())
    assert.isNotNull(await Product.query().where('slug', 'another-good').first())
    assert.isNull(await Product.query().where('slug', 'bad-type').first())
  })

  test('re-importing an export is idempotent (updates, no duplicates)', async ({ assert }) => {
    const text = csv(
      ['product', 'slug', 'status', 'type', 'variant', 'sku', 'price_minor', 'tracks_inventory'],
      [['Lamp', 'lamp', 'active', 'physical', 'Default', 'LAMP-1', '4200', 'yes']]
    )
    await runImport(text)
    const again = await runImport(text)

    assert.equal(again.updated, 1)
    assert.equal(again.created, 0)

    const lamps = await Product.query().where('slug', 'lamp')
    assert.equal(lamps.length, 1)
    const lampVariants = await ProductVariant.query().where('product_id', lamps[0].id)
    assert.equal(lampVariants.length, 1)
  })
})

test.group('E-commerce | product import endpoint', (group) => {
  group.each.setup(async () => resetDatabase())

  test('imports an uploaded CSV and returns the summary', async ({ client, assert }) => {
    const admin = await adminUser()
    const text = csv(['title', 'variant', 'price'], [['Uploaded product', 'Default', '15.00']])

    const res = await client
      .post('/api/admin/ecommerce/products/import')
      .loginAs(admin)
      .file('file', Buffer.from(text), { filename: 'products.csv', contentType: 'text/csv' })

    res.assertStatus(200)
    assert.equal(res.body().created, 1)
    assert.isNotNull(await Product.query().where('slug', 'uploaded-product').first())
  })

  test('is guarded by products:manage', async ({ client }) => {
    const text = csv(['title', 'variant', 'price'], [['Nope', 'Default', '1.00']])
    const res = await client
      .post('/api/admin/ecommerce/products/import')
      .file('file', Buffer.from(text), { filename: 'products.csv', contentType: 'text/csv' })

    // Unauthenticated: the auth middleware rejects before the controller runs.
    res.assertStatus(401)
  })
})
