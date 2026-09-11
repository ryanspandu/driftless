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
import StoreCurrency from '#modules/ecommerce/models/store_currency'
import VariantPrice from '#modules/ecommerce/models/variant_price'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
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

  /**
   * The module's `boot()` hook does this in a running app, but it is gated on
   * the module being enabled — which happens above, after boot. Registering
   * twice throws, so this is guarded rather than repeated.
   */
  if (!getBlockResolver('ProductDetail')) registerEcommerceBlockResolvers()
  await settings.getOrCreate()

  return cleanup
}

async function seedProduct(slug = 'blue-widget', title = 'Blue Widget') {
  const product = await Product.create({
    id: newUlid(),
    slug,
    title,
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

  const variant = await ProductVariant.create({
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

  return { product, variant }
}

/** A published builder page holding one `ProductDetail` block with no slug. */
async function seedTemplate(props: Record<string, unknown> = { slug: '' }) {
  const page = await Page.create({
    id: newUlid(),
    title: 'Product template',
    path: 'product-template',
    status: 'PUBLISHED',
    renderMode: 'SSR',
    content: { content: [{ type: 'ProductDetail', props }], root: {} },
    seo: { title: 'Our shop', description: 'Everything we sell' },
    publishedAt: DateTime.now(),
  })

  const row = await settings.getOrCreate()
  row.productPageId = page.id
  await row.save()

  return page
}

test.group('E-commerce | product template route', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a block with no slug inherits the one the route bound', async ({ assert }) => {
    await seedProduct('blue-widget', 'Blue Widget')

    const doc = { content: [{ type: 'ProductDetail', props: { slug: '' } }] }
    const data = await resolveBlockData([doc], { context: { params: { slug: 'blue-widget' } } })

    /**
     * The whole mechanism in one assertion: one designed page, and the URL
     * decides which product it shows.
     */
    const resolved = data['product:blue-widget'] as { slug: string } | undefined
    assert.isDefined(resolved)
    assert.equal(resolved!.slug, 'blue-widget')
  })

  test("a block with its own slug ignores the route's", async ({ assert }) => {
    await seedProduct('blue-widget')
    await seedProduct('red-widget', 'Red Widget')

    const doc = { content: [{ type: 'ProductDetail', props: { slug: 'red-widget' } }] }
    const data = await resolveBlockData([doc], { context: { params: { slug: 'blue-widget' } } })

    // An explicitly targeted block stays pinned wherever it appears.
    assert.isDefined(data['product:red-widget'])
    assert.isUndefined(data['product:blue-widget'])
  })

  test('a blank block on an ordinary page resolves nothing', async ({ assert }) => {
    await seedProduct()

    const doc = { content: [{ type: 'ProductDetail', props: { slug: '' } }] }
    const data = await resolveBlockData([doc], {})

    // No binding and no slug means the block simply has no target — it must
    // not guess, and it must not take the page down.
    assert.isEmpty(Object.keys(data))
  })

  test('serves the template at the product URL', async ({ client, assert }) => {
    await seedProduct('blue-widget', 'Blue Widget')
    await seedTemplate()

    /**
     * Asserted through the Inertia payload rather than the rendered HTML: a
     * full-page render needs the SSR bundle, which is a build artefact this
     * suite deliberately does not produce. The payload is what the page is
     * built from, so it is the honest thing to check anyway.
     */
    /**
     * The status is deliberately not asserted. An Inertia request that omits
     * `X-Inertia-Version` gets a 409 telling the browser to reload — the
     * payload is still the correct page, and pinning the assertion to the
     * asset version would make this test fail on every rebuild.
     */
    const res = await client.get('/shop/p/blue-widget').header('x-inertia', 'true')

    const product = res.body().props.page.blockData['product:blue-widget']
    assert.equal(product.title, 'Blue Widget')
  })

  test('the page title comes from the product, not the template', async ({ client, assert }) => {
    await seedProduct('blue-widget', 'Blue Widget')
    await seedTemplate()

    const res = await client.get('/shop/p/blue-widget').header('x-inertia', 'true')

    /**
     * Without this every product in the catalogue would share the template's
     * `<title>` and canonical URL, and search engines would index one page for
     * the whole shop — which defeats the point of having product pages.
     */
    const page = res.body().props.page
    assert.equal(page.title, 'Blue Widget')
    // The renderer maps the override's `canonicalPath` to the key the head
    // actually reads (`canonical`) as an absolute URL — the earlier mismatch
    // meant the per-product canonical was silently dropped.
    assert.match(page.seo.canonical, /\/shop\/p\/blue-widget$/)
    // A Product JSON-LD node is emitted for rich results.
    assert.include(page.seo.jsonLd, '"@type":"Product"')
  })

  test('the route echoes its binding to the client', async ({ client, assert }) => {
    await seedProduct('blue-widget')
    await seedTemplate()

    const res = await client.get('/shop/p/blue-widget').header('x-inertia', 'true')

    // The client block needs the same binding the server resolver used, or an
    // SSR page would show one product and hydration would fetch another.
    assert.deepEqual(res.body().props.page.bindings, { slug: 'blue-widget' })
  })

  test('404s for a product that does not exist', async ({ client }) => {
    await seedTemplate()
    const res = await client.get('/shop/p/nothing-here')
    res.assertStatus(404)
  })

  test('404s for a draft product rather than rendering an empty template', async ({ client }) => {
    const { product } = await seedProduct('draft-widget')
    product.status = 'draft'
    await product.save()
    await seedTemplate()

    const res = await client.get('/shop/p/draft-widget')
    res.assertStatus(404)
  })

  test('404s when no template page has been chosen', async ({ client }) => {
    await seedProduct('blue-widget')
    // Deliberately no `seedTemplate()`.

    const res = await client.get('/shop/p/blue-widget')
    res.assertStatus(404)
  })

  test('404s when the template was unpublished', async ({ client }) => {
    await seedProduct('blue-widget')
    const page = await seedTemplate()

    page.status = 'DRAFT'
    await page.save()

    // Honest: rendering nothing would look like the product had vanished.
    const res = await client.get('/shop/p/blue-widget')
    res.assertStatus(404)
  })

  test('never caches one product as another', async ({ client, assert }) => {
    const page = await seedTemplate()
    page.renderMode = 'SSG'
    await page.save()

    await seedProduct('blue-widget', 'Blue Widget')
    await seedProduct('red-widget', 'Red Widget')

    const blue = await client.get('/shop/p/blue-widget').header('x-inertia', 'true')

    /**
     * The SSG snapshot is keyed on the page, so storing one product's HTML
     * would serve it for every other product on the same template — the single
     * worst bug this feature could have. Both the snapshot and the shared-cache
     * header have to be off, or a CDN in front would make the same mistake.
     */
    await page.refresh()
    assert.isNull(page.renderedHtml)
    assert.equal(blue.header('cache-control'), 'no-store')

    /**
     * And the product data is absent from the payload, not stale in it: the
     * `ProductDetail` resolver is volatile, so an SSG page renders the shell
     * and fetches price and stock on the client. A cached "in stock" for
     * something sold out an hour ago is worse than no badge at all.
     */
    assert.isUndefined(blue.body().props.page.blockData['product:blue-widget'])
    assert.deepEqual(blue.body().props.page.bindings, { slug: 'blue-widget' })
  })

  test('404s for a product not sold in the chosen currency', async ({ client }) => {
    await seedProduct('blue-widget')
    await seedTemplate()

    await StoreCurrency.create({ id: newUlid(), code: 'EUR', enabled: true, position: 0 })

    /**
     * Rendering the page with no price on it would be worse than a 404 — the
     * shopper would reach a product they cannot buy and find out at checkout.
     */
    const res = await client.get('/shop/p/blue-widget?currency=EUR')
    res.assertStatus(404)
  })

  test('serves it once a price is listed in that currency', async ({ client, assert }) => {
    const { variant } = await seedProduct('blue-widget', 'Blue Widget')
    await seedTemplate()

    await StoreCurrency.create({ id: newUlid(), code: 'EUR', enabled: true, position: 0 })
    await VariantPrice.create({
      id: newUlid(),
      variantId: variant.id,
      currency: 'EUR',
      priceAmount: 9_000,
    })

    const res = await client.get('/shop/p/blue-widget?currency=EUR').header('x-inertia', 'true')

    const product = res.body().props.page.blockData['product:blue-widget']
    assert.equal(product.variants[0].price.currency, 'EUR')
    assert.equal(product.variants[0].price.amount, 9_000)
  })
})
