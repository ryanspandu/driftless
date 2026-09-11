import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import CmsService from '#services/cms_service'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'

/**
 * PRODUCT-type collections — the ecommerce mirror of CONTENT: a metadata-only,
 * singleton collection whose custom fields extend the built-in Product editor
 * (stored in `ecommerce_products.data`), gated on the ecommerce module.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

/**
 * ecommerce is autoEnable:false, so tests turn it on explicitly: write the row
 * directly + bust the cache `isEnabled` reads (mirrors mcp_products.spec.ts).
 */
async function enableEcommerce() {
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  new ModulesService().bustCache()
}

test.group('Product-type collections', (group) => {
  group.each.setup(async () => resetDatabase())

  test('creating a PRODUCT collection while ecommerce is disabled is refused', async ({
    assert,
  }) => {
    const cms = new CmsService()
    await assert.rejects(
      () => cms.createCollection({ key: 'product_meta', label: 'Product meta', type: 'PRODUCT' }),
      /ecommerce module/i
    )
  })

  test('a PRODUCT collection creates no physical table', async ({ assert }) => {
    await enableEcommerce()
    const cms = new CmsService()
    const col = await cms.createCollection({
      key: 'product_meta',
      label: 'Product meta',
      type: 'PRODUCT',
      fields: [{ key: 'warranty_months', label: 'Warranty', type: 'INTEGER' }],
    })
    assert.equal(col.type, 'PRODUCT')
    assert.isNull(col.tableName ?? null)
    assert.isFalse(await db.connection().schema.hasTable('cms_product_meta'))
  })

  test('only one PRODUCT collection may exist (singleton)', async ({ assert }) => {
    await enableEcommerce()
    const cms = new CmsService()
    await cms.createCollection({ key: 'product_meta', label: 'Product meta', type: 'PRODUCT' })
    await assert.rejects(
      () => cms.createCollection({ key: 'more_meta', label: 'More meta', type: 'PRODUCT' }),
      /only one/i
    )
  })

  test('PRODUCT collections cannot reserve built-in Product field keys', async ({ assert }) => {
    await enableEcommerce()
    const cms = new CmsService()
    await assert.rejects(
      () =>
        cms.createCollection({
          key: 'product_meta',
          label: 'Product meta',
          type: 'PRODUCT',
          fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
        }),
      /built-in Product field/i
    )
  })

  test('a PRODUCT collection refuses generic record writes', async ({ assert }) => {
    await enableEcommerce()
    const cms = new CmsService()
    await cms.createCollection({
      key: 'product_meta',
      label: 'Product meta',
      type: 'PRODUCT',
      fields: [{ key: 'warranty_months', label: 'Warranty', type: 'INTEGER' }],
    })
    await assert.rejects(
      () => cms.createRecord('product_meta', 1, { data: { warranty_months: 12 } }),
      /Product-type collection/i
    )
  })

  test('catalog persists coerced custom data and drops unknown keys', async ({ assert }) => {
    await enableEcommerce()
    const cms = new CmsService()
    await cms.createCollection({
      key: 'product_meta',
      label: 'Product meta',
      type: 'PRODUCT',
      fields: [
        { key: 'care', label: 'Care', type: 'TEXT' },
        { key: 'warranty_months', label: 'Warranty', type: 'INTEGER' },
      ],
    })

    const catalog = new CatalogService()
    const created = await catalog.create(
      {
        title: 'Chair',
        status: 'active',
        data: { care: 'Wipe clean', warranty_months: '24', bogus: 'dropped' },
      },
      1
    )

    assert.deepEqual(created.data, { care: 'Wipe clean', warranty_months: 24 })
    assert.notProperty(created.data ?? {}, 'bogus')
  })

  test('relation ids in product data resolve to labels for the public product', async ({
    assert,
  }) => {
    await enableEcommerce()
    await db.rawQuery('DROP TABLE IF EXISTS "cms_brands"')
    const cms = new CmsService()

    // A normal records collection acts as the brand taxonomy.
    await cms.createCollection({
      key: 'brands',
      label: 'Brands',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    const acme = await cms.createRecord('brands', 1, {
      data: { title: 'Acme' },
      status: 'PUBLISHED',
    })

    // The PRODUCT-type collection relates to it (many-to-many).
    await cms.createCollection({ key: 'product_meta', label: 'Product meta', type: 'PRODUCT' })
    await cms.addField('product_meta', {
      key: 'brands',
      label: 'Brands',
      type: 'RELATION',
      config: { targetKey: 'brands', relationType: 'manyToMany' },
    })

    const catalog = new CatalogService()
    const product = await catalog.create(
      { title: 'Desk', slug: 'desk', status: 'active', data: { brands: [acme.id] } },
      1
    )
    assert.deepEqual(product.data?.brands, [acme.id])
    // The storefront omits a product with nothing sellable, so give it a price.
    await catalog.createVariant(product.id, { title: 'Default', priceAmount: 9900 })

    const publicDto = await new StorefrontCatalogService().findBySlug('desk')
    assert.deepEqual(publicDto.data?.brands, ['Acme'])
  })

  test('an empty records collection can switch to Product and back', async ({ assert }) => {
    await enableEcommerce()
    await db.rawQuery('DROP TABLE IF EXISTS "cms_specs"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'specs',
      label: 'Specs',
      fields: [{ key: 'care', label: 'Care', type: 'TEXT' }],
    })

    const toProduct = await cms.updateCollection('specs', { type: 'PRODUCT' })
    assert.equal(toProduct.type, 'PRODUCT')
    assert.isFalse(await db.connection().schema.hasTable('cms_specs'))
    const singleton = await cms.productTypeCollection()
    assert.equal(singleton?.key, 'specs')

    const back = await cms.updateCollection('specs', { type: 'COLLECTION' })
    assert.equal(back.type, 'COLLECTION')
    assert.isTrue(await db.connection().schema.hasTable('cms_specs'))
  })

  test('switching away from Product is refused once a product has saved custom data', async ({
    assert,
  }) => {
    await enableEcommerce()
    const cms = new CmsService()
    await cms.createCollection({
      key: 'product_meta',
      label: 'Product meta',
      type: 'PRODUCT',
      fields: [{ key: 'care', label: 'Care', type: 'TEXT' }],
    })

    // A product now carries custom-field data.
    await new CatalogService().create(
      { title: 'Lamp', status: 'active', data: { care: 'Dust often' } },
      1
    )

    await assert.rejects(
      () => cms.updateCollection('product_meta', { type: 'COLLECTION' }),
      /saved custom-field data/i
    )
  })
})
