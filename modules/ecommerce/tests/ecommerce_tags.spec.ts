import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'
import Product from '#modules/ecommerce/models/product'
import Tag from '#modules/ecommerce/models/tag'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import { registerEcommerceDataSection } from '#modules/ecommerce/services/data_transfer'

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

/** SUPERADMIN holds `*`, which covers every `ecommerce:*` code. */
async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/** A sellable, published product — so the storefront filter has something to return. */
async function sellableProduct(catalog: CatalogService, tagIds: string[] = []) {
  const product = await catalog.create(
    { title: 'Merino jumper', slug: 'merino-jumper', status: 'active', tagIds },
    null
  )
  await catalog.createVariant(product.id, { title: 'Default', priceAmount: 1999, stockOnHand: 10 })
  return product
}

test.group('E-commerce | tags (admin)', (group) => {
  group.each.setup(async () => resetDatabase())

  test('creates a tag with a generated, de-duplicated slug', async ({ client, assert }) => {
    const admin = await adminUser()

    const first = await client
      .post('/api/admin/ecommerce/tags')
      .loginAs(admin)
      .json({ name: 'Featured' })
    first.assertStatus(201)
    assert.equal(first.body().slug, 'featured')
    assert.equal(first.body().productCount, 0)

    // A second tag whose name slugifies the same must not collide.
    const second = await client
      .post('/api/admin/ecommerce/tags')
      .loginAs(admin)
      .json({ name: 'Featured' })
    second.assertStatus(201)
    assert.equal(second.body().slug, 'featured-2')
  })

  test('lists tags with a live product count', async ({ client, assert }) => {
    const admin = await adminUser()
    const catalog = new CatalogService()
    const tag = await catalog.createTag({ name: 'Sale' })
    await sellableProduct(catalog, [tag.id])

    const res = await client.get('/api/admin/ecommerce/tags').loginAs(admin)
    res.assertStatus(200)
    const row = res.body().find((t: { id: string }) => t.id === tag.id)
    assert.equal(row.productCount, 1)
  })

  test('deleting a tag soft-deletes it and detaches the pivot', async ({ client, assert }) => {
    const catalog = new CatalogService()
    const tag = await catalog.createTag({ name: 'Clearance' })
    const product = await sellableProduct(catalog, [tag.id])
    const admin = await adminUser()

    const res = await client.delete(`/api/admin/ecommerce/tags/${tag.id}`).loginAs(admin)
    res.assertStatus(204)

    // The row survives (soft delete) but no longer counts as live…
    const row = await Tag.query().where('id', tag.id).first()
    assert.isNotNull(row!.deletedAt)
    // …and the product keeps existing, only the pivot link is gone.
    const pivot = await db
      .from('ecommerce_product_tags')
      .where('product_id', product.id)
      .where('tag_id', tag.id)
      .first()
    assert.isNotOk(pivot)
  })

  test('an admin without ecommerce permissions is refused', async ({ client }) => {
    const role = await Role.query().where('name', 'ADMIN').firstOrFail()
    const operator = await User.create({
      email: `plain-${Date.now()}@example.com`,
      password: 'password123',
      username: `plain${Date.now()}`,
      status: 'ACTIVE',
    })
    await operator.related('roles').attach([role.id])

    const write = await client
      .post('/api/admin/ecommerce/tags')
      .loginAs(operator)
      .json({ name: 'Nope' })
    write.assertStatus(403)
  })
})

test.group('E-commerce | product tag assignment', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create with tagIds syncs the pivot and toDto.tagIds', async ({ assert }) => {
    const catalog = new CatalogService()
    const a = await catalog.createTag({ name: 'Wool' })
    const b = await catalog.createTag({ name: 'Winter' })

    const product = await catalog.create(
      { title: 'Scarf', slug: 'scarf', status: 'active', tagIds: [a.id, b.id] },
      null
    )

    assert.sameMembers(product.tagIds, [a.id, b.id])
    const rows = await db.from('ecommerce_product_tags').where('product_id', product.id)
    assert.lengthOf(rows, 2)
  })

  test('update replaces the tag set', async ({ assert }) => {
    const catalog = new CatalogService()
    const a = await catalog.createTag({ name: 'Wool' })
    const b = await catalog.createTag({ name: 'Winter' })
    const product = await catalog.create(
      { title: 'Scarf', slug: 'scarf', status: 'active', tagIds: [a.id] },
      null
    )

    const updated = await catalog.update(product.id, { tagIds: [b.id] })
    assert.sameMembers(updated.tagIds, [b.id])
    const rows = await db.from('ecommerce_product_tags').where('product_id', product.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0]!.tag_id, b.id)
  })
})

test.group('E-commerce | tag archive filter', (group) => {
  group.each.setup(async () => resetDatabase())

  test('list({ tagSlug }) returns only products carrying that tag', async ({ assert }) => {
    const catalog = new CatalogService()
    const tag = await catalog.createTag({ name: 'Featured', slug: 'featured' })

    await sellableProduct(catalog, [tag.id])
    // A second, untagged product must not appear in the archive.
    const other = await catalog.create({ title: 'Plain', slug: 'plain', status: 'active' }, null)
    await catalog.createVariant(other.id, { title: 'Default', priceAmount: 999, stockOnHand: 5 })

    const storefront = new StorefrontCatalogService()
    const result = await storefront.list({ tagSlug: 'featured' })

    assert.equal(result.total, 1)
    assert.equal(result.items[0]!.slug, 'merino-jumper')
    assert.include(result.items[0]!.tagSlugs, 'featured')
  })

  test('tagBySlug resolves a live tag and is null for an unknown slug', async ({ assert }) => {
    const catalog = new CatalogService()
    await catalog.createTag({ name: 'Featured', slug: 'featured' })

    const storefront = new StorefrontCatalogService()
    const found = await storefront.tagBySlug('featured')
    assert.equal(found!.kind, 'tag')
    assert.equal(found!.name, 'Featured')

    assert.isNull(await storefront.tagBySlug('does-not-exist'))
  })
})

test.group('E-commerce | tag data transfer', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    await new ModulesService().setEnabled('ecommerce', true)
    registerCoreDataSections()
    registerEcommerceDataSection()
    return cleanup
  })

  test('tags + product-tag pivot round-trip (preserve ids)', async ({ assert }) => {
    const catalog = new CatalogService()
    const tag = await catalog.createTag({ name: 'Featured', slug: 'featured' })
    const product = await catalog.create(
      { title: 'Sofa', slug: 'sofa', status: 'active', tagIds: [tag.id] },
      null
    )

    const archive = await new SiteExportService().export({ only: ['ecommerce'] })

    await db.from('ecommerce_product_tags').delete()
    await db.from('ecommerce_products').delete()
    await db.from('ecommerce_tags').delete()

    const result = await new SiteImportService().import(archive)
    assert.isTrue(result.sections.some((s) => s.name === 'ecommerce'))
    assert.isNotNull(await Tag.query().where('id', tag.id).first())
    assert.isNotNull(await Product.query().where('id', product.id).first())
    const pivot = await db
      .from('ecommerce_product_tags')
      .where('product_id', product.id)
      .where('tag_id', tag.id)
      .first()
    assert.isNotNull(pivot)
  })
})
