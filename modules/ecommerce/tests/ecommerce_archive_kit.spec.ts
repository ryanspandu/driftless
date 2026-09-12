import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Module from '#models/module'
import Page from '#models/page'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import { getBlockResolver } from '#services/block_data_resolvers'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Category from '#modules/ecommerce/models/category'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { registerEcommerceBlockResolvers } from '#modules/ecommerce/services/block_resolvers'

/**
 * `/shop/category/:slug` (and `/shop/tag/:slug`) hand a CODE/kit override the
 * resolved product list as `props.record` — the same mechanism the `shop` and
 * `product` slots already had. Previously the category/tag archive override
 * got only `bindings`/`seoOverride`, so a kit template had no way to render
 * the taxonomy's products SSR and had to client-fetch everything itself.
 */

const settings = new StoreSettingsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  if (!getBlockResolver('ProductDetail')) registerEcommerceBlockResolvers()
  await settings.getOrCreate()

  return cleanup
}

async function seedCategoryWithProduct(slug = 'widgets', name = 'Widgets') {
  const category = await Category.create({
    id: newUlid(),
    slug,
    name,
    description: 'All our widgets',
    position: 0,
  })

  const product = await Product.create({
    id: newUlid(),
    slug: 'blue-widget',
    title: 'Blue Widget',
    subtitle: 'A widget, in blue',
    description: {},
    type: 'physical',
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: false,
    position: 0,
    priceFromAmount: 10_000,
  })
  await product.related('categories').attach([category.id])
  await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: 10_000,
    optionValues: {},
    stockOnHand: 5,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { category, product }
}

/**
 * A published CODE page (component need not exist for the server payload —
 * the client would resolve the kit component; mirrors the equivalent product
 * template test).
 */
async function kitCategoryArchivePage() {
  const page = await Page.create({
    id: newUlid(),
    title: 'Kit category archive',
    path: `kit-category-archive-${newUlid().slice(-6)}`,
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'CODE',
    component: 'x',
    content: { root: {}, content: [] },
    seo: {},
    publishedAt: DateTime.now(),
  } as never)
  const row = await settings.getOrCreate()
  row.categoryPageId = page.id
  await row.save()
  return page
}

test.group('E-commerce | category archive — kit override', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a CODE template receives the taxonomy + resolved products in props.record (SSR)', async ({
    client,
    assert,
  }) => {
    await seedCategoryWithProduct('widgets', 'Widgets')
    await kitCategoryArchivePage()

    const res = await client
      .get('/shop/category/widgets')
      .header('x-inertia', 'true')
      .header('x-inertia-version', '1')
    res.assertStatus(200)

    const payload = res.body().props.page
    assert.equal(payload.component, 'x')
    const record = payload.record as { taxonomy: { slug: string }; items: unknown[]; total: number }
    assert.equal(record.taxonomy.slug, 'widgets')
    assert.equal(record.total, 1)
    assert.lengthOf(record.items, 1)
    assert.deepEqual(payload.bindings, { slug: 'widgets', kind: 'category' })
  })

  test('the built-in archive (no override) still lists the category products', async ({
    client,
    assert,
  }) => {
    await seedCategoryWithProduct('widgets', 'Widgets')
    // Deliberately no kitCategoryArchivePage() — falls back to the built-in Inertia archive.

    const res = await client
      .get('/shop/category/widgets')
      .header('x-inertia', 'true')
      .header('x-inertia-version', '1')
    res.assertStatus(200)
    assert.equal(res.body().component, 'modules/ecommerce/storefront/archive')
    assert.equal(res.body().props.total, 1)
  })
})
