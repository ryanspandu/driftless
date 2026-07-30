import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Module from '#models/module'
import Page from '#models/page'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import { getBlockResolver, resolveBlockData } from '#services/block_data_resolvers'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import StorefrontSeederService from '#modules/ecommerce/services/storefront_seeder_service'
import { registerEcommerceBlockResolvers } from '#modules/ecommerce/services/block_resolvers'

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

async function seedProduct(slug = 'blue-widget', title = 'Blue Widget') {
  const product = await Product.create({
    id: newUlid(),
    slug,
    title,
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

  return product
}

test.group('E-commerce | storefront seeding', (group) => {
  group.each.setup(async () => resetDatabase())

  test('creates a shop front and a product template', async ({ assert }) => {
    const result = await new StorefrontSeederService().seed()

    assert.isNotNull(result.shopPageId)
    assert.isNotNull(result.productPageId)
    assert.lengthOf(result.created, 2)

    const store = await settings.getOrCreate()
    assert.equal(store.shopPageId, result.shopPageId)
    assert.equal(store.productPageId, result.productPageId)
  })

  test('the pages are published and server-rendered', async ({ assert }) => {
    const { shopPageId, productPageId } = await new StorefrontSeederService().seed()

    for (const id of [shopPageId!, productPageId!]) {
      const page = await Page.findOrFail(id)
      assert.equal(page.status, 'PUBLISHED')
      /**
       * SSR, not SSG. Both render live prices and stock; a snapshot would bake
       * in figures that go stale.
       */
      assert.equal(page.renderMode, 'SSR')
    }
  })

  test('running it twice creates nothing the second time', async ({ assert }) => {
    const seeder = new StorefrontSeederService()

    const first = await seeder.seed()
    const second = await seeder.seed()

    assert.lengthOf(second.created, 0)
    assert.equal(second.shopPageId, first.shopPageId)
    assert.equal(second.productPageId, first.productPageId)
    assert.lengthOf(await Page.all(), 2)
  })

  test('never overwrites an edited page', async ({ assert }) => {
    const seeder = new StorefrontSeederService()
    const { shopPageId } = await seeder.seed()

    const page = await Page.findOrFail(shopPageId!)
    page.title = 'My redesigned shop'
    page.content = { root: { props: {} }, zones: {}, content: [] }
    await page.save()

    await seeder.seed()
    await page.refresh()

    /**
     * The operator's shop is theirs. Toggling the module off and on must not
     * undo their work.
     */
    assert.equal(page.title, 'My redesigned shop')
    assert.isEmpty((page.content as { content: unknown[] }).content)
  })

  test('adopts a page already sitting at the path', async ({ assert }) => {
    const existing = await Page.create({
      id: newUlid(),
      title: 'Mine',
      path: 'shop-front',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      content: { root: { props: {} }, zones: {}, content: [] },
      seo: {},
      publishedAt: DateTime.now(),
    })

    const result = await new StorefrontSeederService().seed()

    /**
     * An operator may have unset the setting while keeping the page. Creating a
     * second one at the same path would give them two shop fronts and no way
     * to tell which is live.
     */
    assert.equal(result.shopPageId, existing.id)
    assert.notInclude(result.created, 'shop front')
  })

  test('the seeded shop front actually lists products', async ({ assert }) => {
    await seedProduct()
    const { shopPageId } = await new StorefrontSeederService().seed()

    const page = await Page.findOrFail(shopPageId!)
    const data = await resolveBlockData([page.content], {})

    /**
     * The default `ProductList` has a blank source, so it shows the whole
     * catalogue — a default pointing at a category a new store does not have
     * would render an empty shop on first load.
     */
    const key = Object.keys(data).find((k) => k.startsWith('products:'))
    assert.isDefined(key)
    assert.lengthOf(data[key!] as unknown[], 1)
  })

  test('the seeded product template binds to the URL, not one product', async ({ assert }) => {
    await seedProduct('blue-widget', 'Blue Widget')
    const { productPageId } = await new StorefrontSeederService().seed()

    const page = await Page.findOrFail(productPageId!)

    // With no binding it resolves nothing — the slug field is deliberately blank.
    assert.isEmpty(Object.keys(await resolveBlockData([page.content], {})))

    const bound = await resolveBlockData([page.content], {
      context: { params: { slug: 'blue-widget' } },
    })
    assert.isDefined(bound['product:blue-widget'])
  })
})

test.group('E-commerce | shop front route', (group) => {
  group.each.setup(async () => resetDatabase())

  test('404s before anything is configured', async ({ client }) => {
    const res = await client.get('/shop')
    res.assertStatus(404)
  })

  test('serves the seeded page once enabled', async ({ client, assert }) => {
    await seedProduct('blue-widget', 'Blue Widget')
    await new StorefrontSeederService().seed()

    const res = await client.get('/shop').header('x-inertia', 'true')

    const blockData = res.body().props.page.blockData as Record<string, unknown>
    const key = Object.keys(blockData).find((k) => k.startsWith('products:'))

    assert.isDefined(key)
    assert.lengthOf(blockData[key!] as unknown[], 1)
  })

  test('404s when the shop front is unpublished', async ({ client }) => {
    const { shopPageId } = await new StorefrontSeederService().seed()

    const page = await Page.findOrFail(shopPageId!)
    page.status = 'DRAFT'
    await page.save()

    const res = await client.get('/shop')
    res.assertStatus(404)
  })
})

test.group('E-commerce | enabling the module', (group) => {
  group.each.setup(async () => resetDatabase())

  test('switching it on seeds the storefront', async ({ assert }) => {
    // Start from off, so the toggle crosses the off→on edge.
    const row = await Module.findByOrFail('name', 'ecommerce')
    row.enabled = false
    await row.save()
    new ModulesService().bustCache()

    await new ModulesService().setEnabled('ecommerce', true)

    const store = await settings.getOrCreate()
    assert.isNotNull(store.shopPageId)
    assert.isNotNull(store.productPageId)
  })

  test('switching it off and on again changes nothing', async ({ assert }) => {
    const modules = new ModulesService()
    const row = await Module.findByOrFail('name', 'ecommerce')
    row.enabled = false
    await row.save()
    modules.bustCache()

    await modules.setEnabled('ecommerce', true)
    const first = (await settings.getOrCreate()).shopPageId

    await modules.setEnabled('ecommerce', false)
    await modules.setEnabled('ecommerce', true)

    const store = await settings.getOrCreate()
    assert.equal(store.shopPageId, first)
    assert.lengthOf(await Page.all(), 2)
  })

  test('enabling an already-enabled module does not re-seed', async ({ assert }) => {
    const modules = new ModulesService()

    // It is already enabled from the setup, so this is a no-op edge.
    await modules.setEnabled('ecommerce', true)

    /**
     * `onEnable` fires on the off→on transition only. Without that guard, every
     * save of the settings screen would re-run first-run seeding.
     */
    assert.lengthOf(await Page.all(), 0)
  })
})
