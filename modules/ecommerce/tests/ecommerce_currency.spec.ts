import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Module from '#models/module'
import User from '#models/user'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import StoreCurrency from '#modules/ecommerce/models/store_currency'
import VariantPrice from '#modules/ecommerce/models/variant_price'
import PricingService from '#modules/ecommerce/services/pricing_service'
import CurrencyService from '#modules/ecommerce/services/currency_service'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  overrideGateway('stripe', new FakeGatewayDriver('stripe'))
  await new StoreSettingsService().getOrCreate()

  return async () => {
    clearGatewayOverrides()
    await cleanup()
  }
}

/** A product priced in the store's base currency (USD by default). */
async function seedProduct(basePrice = 10_000, stock = 20) {
  const product = await Product.create({
    id: newUlid(),
    slug: `p-${newUlid().toLowerCase().slice(-8)}`,
    title: 'Test product',
    description: {},
    type: 'physical',
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: false,
    position: 0,
    priceFromAmount: basePrice,
  })

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: basePrice,
    optionValues: {},
    stockOnHand: stock,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

/** Turn on a currency and list a price for a variant in it. */
async function listPrice(variantId: string, currency: string, amount: number) {
  await StoreCurrency.firstOrCreate(
    { code: currency },
    { id: newUlid(), code: currency, enabled: true, position: 0 }
  )
  return VariantPrice.create({
    id: newUlid(),
    variantId,
    currency,
    priceAmount: amount,
  })
}

test.group('E-commerce | currency resolution', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a store with no extra currencies reports exactly its base', async ({ assert }) => {
    const enabled = await new CurrencyService().enabled()

    /**
     * An untouched store must behave precisely as it did before multi-currency
     * existed — one currency, the base, always available.
     */
    assert.lengthOf(enabled, 1)
    assert.equal(enabled[0].code, 'USD')
    assert.isTrue(enabled[0].isBase)
  })

  test('the base can never be disabled', async ({ assert }) => {
    const currencies = new CurrencyService()
    await currencies.replace(['EUR', 'USD'])

    const enabled = await currencies.enabled()
    const codes = enabled.map((c) => c.code)

    // USD was passed in and is the base; it is filtered out of the rows and
    // still present in the result.
    assert.include(codes, 'USD')
    assert.include(codes, 'EUR')
    assert.lengthOf(await StoreCurrency.query().where('code', 'USD'), 0)
  })

  test('switching a currency off keeps the prices already listed in it', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    const currencies = new CurrencyService()
    await currencies.replace([])

    assert.isFalse(await currencies.isEnabled('EUR'))
    /**
     * Disabled, not deleted. A merchant who turns EUR off for a month must not
     * lose every euro price they set.
     */
    assert.lengthOf(await VariantPrice.query().where('currency', 'EUR'), 1)
  })

  test('reports the exponent, so a zero-decimal currency is known to be one', async ({
    assert,
  }) => {
    const currencies = new CurrencyService()
    await currencies.replace(['JPY'])

    const jpy = (await currencies.enabled()).find((c) => c.code === 'JPY')
    assert.equal(jpy?.exponent, 0)
  })

  test('rejects something that is not a currency code', async ({ assert }) => {
    await assert.rejects(
      () => new CurrencyService().replace(['DOLLARS']),
      /not a currency this shop can sell in/i
    )
  })

  test('rejects three letters that are not a real currency', async ({ assert }) => {
    /**
     * The important half. `/^[A-Z]{3}$/` would happily accept `XYZ`, and the
     * mistake would only surface when a buyer could not pay — after the
     * merchant had priced a catalogue in it.
     */
    for (const fake of ['XYZ', 'ABC', 'EU', 'usdd']) {
      await assert.rejects(() => new CurrencyService().replace([fake]))
    }

    assert.isFalse(await new CurrencyService().isEnabled('XYZ'))
  })

  test('the picker cannot smuggle one past the server', async ({ client, assert }) => {
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()

    const res = await client
      .put('/api/admin/ecommerce/currencies')
      .loginAs(admin)
      .json({ codes: ['XYZ'] })

    assert.equal(res.status(), 422)
    assert.lengthOf(await StoreCurrency.all(), 0)
  })

  test('accepts a real one the picker offers', async ({ assert }) => {
    const enabled = await new CurrencyService().replace(['IDR', 'JPY'])
    const codes = enabled.map((c) => c.code)

    assert.include(codes, 'IDR')
    assert.include(codes, 'JPY')
    // JPY has no minor unit — the exponent table already knew that.
    assert.equal(enabled.find((c) => c.code === 'JPY')?.exponent, 0)
  })
})

test.group('E-commerce | pricing in another currency', (group) => {
  group.each.setup(async () => resetDatabase())

  test('uses the listed price, not the base one', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 2 }], {
      currency: 'EUR',
    })

    assert.equal(priced.currency, 'EUR')
    assert.equal(priced.lines[0].unitAmount, 9_000)
    assert.equal(priced.subtotalAmount, 18_000)
  })

  test('refuses rather than falling back to the base price', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await new CurrencyService().replace(['JPY'])

    /**
     * The single most dangerous thing multi-currency can do. `Money` stores
     * minor units, so a base amount of 10000 means $100.00 in USD and ¥10000 in
     * JPY — about a 30% error, applied silently. Refusing is the only correct
     * answer, and there is no conversion anywhere in the module that could do
     * otherwise.
     */
    await assert.rejects(
      () =>
        new PricingService().price([{ variantId: variant.id, quantity: 1 }], { currency: 'JPY' }),
      /not sold in JPY/i
    )
  })

  test('names the item it cannot price', async ({ assert }) => {
    const priced = await seedProduct(10_000)
    priced.product.title = 'Blue Widget'
    await priced.product.save()

    await assert.rejects(
      () =>
        new PricingService().price([{ variantId: priced.variant.id, quantity: 1 }], {
          currency: 'EUR',
        }),
      /Blue Widget/
    )
  })

  test('base pricing is unchanged when no currency is asked for', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])

    assert.equal(priced.currency, 'USD')
    assert.equal(priced.lines[0].unitAmount, 10_000)
  })

  test('a basket priced in one currency is charged in it', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    const result = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      currency: 'EUR',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.currency, 'EUR')
    assert.equal(order.totalAmount, 9_000)

    // And the gateway is told the same thing, not the base currency.
    const payment = await db.from('ecommerce_payments').where('order_id', order.id).firstOrFail()
    assert.equal(String(payment.currency), 'EUR')
  })
})

test.group('E-commerce | storefront currency', (group) => {
  group.each.setup(async () => resetDatabase())

  test('lists products at their price in the chosen currency', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    const result = await new StorefrontCatalogService().list({ page: 1, pageSize: 10 }, 'EUR')

    assert.lengthOf(result.items, 1)
    assert.equal(result.items[0].variants[0].price.amount, 9_000)
    assert.equal(result.items[0].variants[0].price.currency, 'EUR')
    // "From" is derived from what is sellable here, not the stored base column.
    assert.equal(result.items[0].priceFrom?.amount, 9_000)
  })

  test('hides a product that is not sold in the chosen currency', async ({ assert }) => {
    await seedProduct(10_000)
    await new CurrencyService().replace(['EUR'])

    const result = await new StorefrontCatalogService().list({ page: 1, pageSize: 10 }, 'EUR')

    /**
     * Showing it at the base price would advertise a number nobody can be
     * charged, and letting a shopper reach a product page they cannot buy from
     * is worse than not listing it.
     */
    assert.isEmpty(result.items)
  })

  test('an unknown currency falls back to base rather than erroring', async ({
    client,
    assert,
  }) => {
    const { variant } = await seedProduct(10_000)

    const res = await client.get('/api/shop/products?currency=NOK')

    res.assertStatus(200)
    assert.equal(res.body().items[0].variants[0].price.currency, 'USD')
    assert.equal(res.body().items[0].variants[0].price.amount, 10_000)
    assert.isString(variant.id)
  })

  test('remembers the choice and prices the basket in it', async ({ client, assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    const chosen = await client.post('/api/shop/currency').json({ currency: 'EUR' })
    chosen.assertStatus(200)
    const currencyCookie = chosen.cookie('dl_currency')?.value ?? ''

    const added = await client
      .post('/api/shop/cart/items')
      .withCookie('dl_currency', currencyCookie)
      .json({ variantId: variant.id, quantity: 1 })

    added.assertStatus(200)
    assert.equal(added.body().currency, 'EUR')
    assert.equal(added.body().total.amount, 9_000)
  })

  test('refuses a currency the shop does not sell in', async ({ client }) => {
    const res = await client.post('/api/shop/currency').json({ currency: 'NOK' })
    res.assertStatus(422)
  })

  test('refuses to switch when the basket holds something unpriced there', async ({
    client,
    assert,
  }) => {
    const sellable = await seedProduct(10_000)
    const baseOnly = await seedProduct(5_000)
    baseOnly.product.title = 'Base Only Widget'
    await baseOnly.product.save()

    await listPrice(sellable.variant.id, 'EUR', 9_000)

    const added = await client
      .post('/api/shop/cart/items')
      .json({ variantId: baseOnly.variant.id, quantity: 1 })
    const cart = added.cookie('dl_cart')?.value ?? ''

    const res = await client
      .post('/api/shop/currency')
      .withCookie('dl_cart', cart)
      .json({ currency: 'EUR' })

    /**
     * Switching and silently dropping what cannot be priced takes an item out
     * of someone's basket without telling them — the kind of thing a shopper
     * notices only after they have paid.
     */
    assert.equal(res.status(), 422)
    assert.include(res.body().message, 'Base Only Widget')
  })

  test('the currency cookie cannot assert a price', async ({ client, assert }) => {
    const { variant } = await seedProduct(10_000)
    await listPrice(variant.id, 'EUR', 9_000)

    /**
     * The cookie holds a preference, not a credential. It selects which listed
     * price to read and can name only a currency the store already sells in —
     * there is no value it could hold that produces an amount the merchant did
     * not set.
     */
    const res = await client.get('/api/shop/products').withCookie('dl_currency', 'EUR')

    assert.equal(res.body().items[0].variants[0].price.amount, 9_000)

    const forged = await client.get('/api/shop/products').withCookie('dl_currency', 'XXX')
    assert.equal(forged.body().items[0].variants[0].price.amount, 10_000)
  })
})

test.group('E-commerce | changing the base currency', (group) => {
  group.each.setup(async () => resetDatabase())

  test('changes freely on an empty store', async ({ assert }) => {
    const store = await new StoreSettingsService().update({ currency: 'IDR' })
    assert.equal(store.currency, 'IDR')
  })

  test('refuses a code that is not a real currency', async ({ assert }) => {
    /**
     * `exponentOf` used to be the only check here, and it returns 2 for
     * anything it does not recognise rather than throwing — so this validated
     * nothing at all until it was replaced.
     */
    await assert.rejects(
      () => new StoreSettingsService().update({ currency: 'XYZ' }),
      /not a currency this shop can sell in/i
    )
  })

  test('asks before reinterpreting an existing catalogue', async ({ assert }) => {
    await seedProduct(10_000)

    /**
     * A variant at `10000` is $100.00 today and Rp10.000 the moment the base
     * becomes IDR. Recoverable — the merchant can re-enter prices — so this
     * asks rather than refuses.
     */
    await assert.rejects(
      () => new StoreSettingsService().update({ currency: 'IDR' }),
      /reinterprets/i
    )

    // Unchanged until it is confirmed.
    assert.equal((await new StoreSettingsService().getOrCreate()).currency, 'USD')
  })

  test('goes through once confirmed', async ({ assert }) => {
    await seedProduct(10_000)

    const store = await new StoreSettingsService().update({
      currency: 'IDR',
      confirmRepricing: true,
    })

    assert.equal(store.currency, 'IDR')
  })

  /**
   * `products.currency` is a copy of the base, written at creation. Left behind
   * by the switch it makes the catalogue contradict itself: the product picker
   * formats a price with the product's currency while every total uses the
   * store's, so one item read "$15.00" and "IDR 15.00" on the same screen.
   */
  test('relabels the catalogue it just reinterpreted', async ({ assert }) => {
    const { product } = await seedProduct(10_000)

    await new StoreSettingsService().update({ currency: 'IDR', confirmRepricing: true })

    await product.refresh()
    assert.equal(product.currency, 'IDR')

    // Relabelled, not converted — the number is the whole point of the warning.
    const variant = await ProductVariant.findOrFail(
      (await ProductVariant.query().where('product_id', product.id).firstOrFail()).id
    )
    assert.equal(variant.priceAmount, 10_000)
  })

  test('leaves the catalogue alone when the currency does not change', async ({ assert }) => {
    const { product } = await seedProduct(10_000)

    /**
     * Read back before capturing: the in-memory value from `create` carries
     * more precision than the database returns, so comparing the two would
     * fail even when nothing wrote.
     */
    await product.refresh()
    const before = product.updatedAt?.toISO()

    await new StoreSettingsService().update({ currency: 'USD', storeName: 'Same currency' })

    await product.refresh()
    assert.equal(product.currency, 'USD')
    // No write at all, so a no-op save cannot churn every product row.
    assert.equal(product.updatedAt?.toISO(), before)
  })

  test('refuses outright once an order exists', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)

    await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    /**
     * The hard stop. Orders record their own currency so history stays
     * correct, but the store's figures would then span two units with no rate
     * to reconcile them — and this module has none by design. Confirming does
     * not help.
     */
    for (const dto of [{ currency: 'IDR' }, { currency: 'IDR', confirmRepricing: true }]) {
      await assert.rejects(() => new StoreSettingsService().update(dto), /cannot be changed/i)
    }

    assert.equal((await new StoreSettingsService().getOrCreate()).currency, 'USD')
  })

  test('the API surfaces the confirmation as a 422, not a crash', async ({ client, assert }) => {
    await seedProduct(10_000)
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()

    const asked = await client
      .put('/api/admin/ecommerce/settings')
      .loginAs(admin)
      .json({ currency: 'IDR' })

    assert.equal(asked.status(), 422)
    assert.match(asked.body().message, /reinterprets/i)

    const confirmed = await client
      .put('/api/admin/ecommerce/settings')
      .loginAs(admin)
      .json({ currency: 'IDR', confirmRepricing: true })

    confirmed.assertStatus(200)
    assert.equal(confirmed.body().currency, 'IDR')
  })
})
