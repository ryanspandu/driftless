import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Module from '#models/module'
import User from '#models/user'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import PricingService from '#modules/ecommerce/services/pricing_service'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()
  await new StoreSettingsService().getOrCreate()

  return cleanup
}

async function seedProduct(overrides: Partial<Product> = {}) {
  const product = await Product.create({
    id: newUlid(),
    slug: `p-${newUlid().toLowerCase().slice(-8)}`,
    title: 'Partner Widget',
    description: {},
    type: 'physical',
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: false,
    position: 0,
    priceFromAmount: 10_000,
    ...overrides,
  } as never)

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: 10_000,
    optionValues: {},
    stockOnHand: 10,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

test.group('E-commerce | product buy button', (group) => {
  group.each.setup(async () => resetDatabase())

  test('defaults to add-to-basket', async ({ assert }) => {
    const { product } = await seedProduct()

    /**
     * Refetched deliberately: Lucid does not read a column's DB default back
     * into the model it just created, so the in-memory row holds `undefined`
     * until it is loaded again. The DTOs default it for the same reason.
     */
    const stored = await Product.findOrFail(product.id)

    assert.equal(stored.ctaMode, 'add_to_cart')
    assert.isFalse(stored.isExternal)
  })

  test('an external product cannot be added to a basket', async ({ client, assert }) => {
    const { variant } = await seedProduct({
      ctaMode: 'external',
      externalUrl: 'https://p.test/x',
    } as never)

    /**
     * The storefront draws a link rather than an add button, but that is
     * cosmetic. This is the guard: a crafted POST must not put a product the
     * shop cannot fulfil into a basket.
     */
    const res = await client.post('/api/shop/cart/items').json({ variantId: variant.id })

    assert.equal(res.status(), 422)
    assert.include(res.body().message, 'sold elsewhere')
  })

  test('an external product cannot be priced', async ({ assert }) => {
    const { variant } = await seedProduct({
      ctaMode: 'external',
      externalUrl: 'https://p.test/x',
    } as never)

    /**
     * Checked separately from the cart because it is reached by paths the cart
     * never touches — a manual order, or a re-price of a basket whose product
     * was switched to external after it was added.
     */
    await assert.rejects(
      () => new PricingService().price([{ variantId: variant.id, quantity: 1 }]),
      /sold elsewhere/i
    )
  })

  test('switching an existing product to external is enough to stop it', async ({
    client,
    assert,
  }) => {
    const { product, variant } = await seedProduct()

    // It sells fine to begin with.
    ;(await client.post('/api/shop/cart/items').json({ variantId: variant.id })).assertStatus(200)

    product.ctaMode = 'external'
    product.externalUrl = 'https://p.test/x'
    await product.save()

    const res = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    assert.equal(res.status(), 422)
  })

  test('external needs a link', async ({ assert }) => {
    const catalog = new CatalogService()

    await assert.rejects(
      () => catalog.create({ title: 'No link', ctaMode: 'external' }, null),
      /needs the address to link to/i
    )
  })

  test('refuses a link that is not http', async ({ assert }) => {
    const catalog = new CatalogService()

    /**
     * That URL is rendered as something a buyer clicks. A `javascript:` value
     * stored here is stored XSS with an affiliate label on it.
     */
    await assert.rejects(
      () =>
        catalog.create(
          { title: 'Bad link', ctaMode: 'external', externalUrl: 'javascript:alert(1)' },
          null
        ),
      /must start with http/i
    )
  })

  test('switching away from external clears the link', async ({ assert }) => {
    const catalog = new CatalogService()
    const created = await catalog.create(
      {
        title: 'Partner',
        ctaMode: 'external',
        externalUrl: 'https://p.test/x',
        externalLabel: 'Buy there',
      },
      null
    )

    const updated = await catalog.update(created.id, { ctaMode: 'add_to_cart' })

    /**
     * A stale URL left on a product that is sold here again is a trap for
     * whoever edits it next — and one bad toggle away from linking customers
     * off-site by accident.
     */
    assert.equal(updated.ctaMode, 'add_to_cart')
    assert.isNull(updated.externalUrl)
    assert.isNull(updated.externalLabel)
  })

  test('the storefront exposes the link only for external products', async ({ assert }) => {
    await seedProduct({
      ctaMode: 'external',
      externalUrl: 'https://p.test/x',
      externalLabel: 'Buy on Partner',
    } as never)
    await seedProduct({ title: 'Ours' } as never)

    const result = await new StorefrontCatalogService().list({ page: 1, pageSize: 10 })
    const external = result.items.find((p) => p.cta.mode === 'external')
    const ours = result.items.find((p) => p.cta.mode === 'add_to_cart')

    assert.equal(external?.cta.url, 'https://p.test/x')
    assert.equal(external?.cta.label, 'Buy on Partner')

    // Nothing to link to for something the shop sells itself.
    assert.isNull(ours?.cta.url ?? null)
  })

  test('buy-now is an ordinary product to the server', async ({ client, assert }) => {
    const { variant } = await seedProduct({ ctaMode: 'buy_now' } as never)

    /**
     * "Buy now" is a client-side redirect after an ordinary add, not a second
     * checkout path — one route to an order means one place where stock,
     * discounts and idempotency are handled.
     */
    const res = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    assert.equal(res.status(), 200)
  })

  test('an admin can set the mode through the API', async ({ client, assert }) => {
    const { product } = await seedProduct()
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()

    const res = await client
      .put(`/api/admin/ecommerce/products/${product.id}`)
      .loginAs(admin)
      .json({ title: product.title, ctaMode: 'external', externalUrl: 'https://p.test/x' })

    res.assertStatus(200)
    assert.equal(res.body().ctaMode, 'external')
    assert.equal(res.body().externalUrl, 'https://p.test/x')
  })
})
