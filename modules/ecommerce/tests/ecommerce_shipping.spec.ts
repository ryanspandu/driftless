import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import ShippingZone from '#modules/ecommerce/models/shipping_zone'
import ShippingMethod from '#modules/ecommerce/models/shipping_method'
import ShippingRate from '#modules/ecommerce/models/shipping_rate'
import StoreCurrency from '#modules/ecommerce/models/store_currency'
import VariantPrice from '#modules/ecommerce/models/variant_price'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import OrderService from '#modules/ecommerce/services/order_service'
import OrderNotifierService from '#modules/ecommerce/services/order_notifier_service'
import db from '@adonisjs/lucid/services/db'
import ShippingService from '#modules/ecommerce/services/shipping_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'

const UK_ADDRESS = { line1: '1 High Street', city: 'London', country: 'GB' }

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

async function seedProduct(price = 10_000, type: 'physical' | 'digital' = 'physical') {
  const product = await Product.create({
    id: newUlid(),
    slug: `p-${newUlid().toLowerCase().slice(-8)}`,
    title: 'Test product',
    description: {},
    type,
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: false,
    position: 0,
    priceFromAmount: price,
  })

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: price,
    optionValues: {},
    stockOnHand: 20,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

async function seedZone(
  input: {
    name?: string
    countries?: string[]
    states?: string[]
    position?: number
  } = {}
) {
  return ShippingZone.create({
    id: newUlid(),
    name: input.name ?? 'Zone',
    countries: input.countries ?? [],
    states: input.states ?? [],
    position: input.position ?? 0,
    enabled: true,
  })
}

async function seedMethod(
  zoneId: string,
  input: { name?: string; rate?: number; freeAbove?: number | null; position?: number } = {}
) {
  return ShippingMethod.create({
    id: newUlid(),
    zoneId,
    name: input.name ?? 'Standard',
    description: null,
    rateAmount: input.rate ?? 500,
    freeAboveAmount: input.freeAbove ?? null,
    minDeliveryDays: null,
    maxDeliveryDays: null,
    enabled: true,
    position: input.position ?? 0,
  })
}

function checkout(variantId: string, extra: Record<string, unknown> = {}) {
  return new CheckoutService().start({
    lines: [{ variantId, quantity: 1 }],
    email: 'buyer@example.com',
    gateway: 'stripe',
    shippingAddress: UK_ADDRESS,
    successUrl: 'https://shop.test/thanks',
    cancelUrl: 'https://shop.test/cart',
    ...extra,
  })
}

test.group('E-commerce | shipping zones', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a country zone beats the catch-all', async ({ assert }) => {
    const anywhere = await seedZone({ name: 'Anywhere', countries: [] })
    const uk = await seedZone({ name: 'UK', countries: ['GB'] })

    const zone = await new ShippingService().zoneFor({ country: 'GB' })

    assert.equal(zone?.id, uk.id)
    assert.notEqual(zone?.id, anywhere.id)
  })

  test('a state zone beats a country zone', async ({ assert }) => {
    await seedZone({ name: 'US', countries: ['US'] })
    const california = await seedZone({ name: 'CA', countries: ['US'], states: ['CA'] })

    const zone = await new ShippingService().zoneFor({ country: 'US', state: 'CA' })
    assert.equal(zone?.id, california.id)
  })

  test('a state zone does not match a different state', async ({ assert }) => {
    const us = await seedZone({ name: 'US', countries: ['US'] })
    await seedZone({ name: 'CA only', countries: ['US'], states: ['CA'] })

    const zone = await new ShippingService().zoneFor({ country: 'US', state: 'NY' })
    assert.equal(zone?.id, us.id)
  })

  test('the catch-all covers a country nobody listed', async ({ assert }) => {
    const anywhere = await seedZone({ name: 'Anywhere', countries: [] })
    await seedZone({ name: 'UK', countries: ['GB'] })

    const zone = await new ShippingService().zoneFor({ country: 'JP' })
    assert.equal(zone?.id, anywhere.id)
  })

  test('no zone matches an unlisted country when there is no catch-all', async ({ assert }) => {
    await seedZone({ name: 'UK', countries: ['GB'] })

    const zone = await new ShippingService().zoneFor({ country: 'JP' })
    assert.isNull(zone)
  })

  test('a disabled zone is never matched', async ({ assert }) => {
    const uk = await seedZone({ name: 'UK', countries: ['GB'] })
    uk.enabled = false
    await uk.save()

    assert.isNull(await new ShippingService().zoneFor({ country: 'GB' }))
  })

  test('country codes match regardless of case', async ({ assert }) => {
    const uk = await seedZone({ countries: ['gb'] })
    const zone = await new ShippingService().zoneFor({ country: 'GB' })
    assert.equal(zone?.id, uk.id)
  })
})

test.group('E-commerce | shipping rates', (group) => {
  group.each.setup(async () => resetDatabase())

  test('quotes every enabled method in the zone', async ({ assert }) => {
    const zone = await seedZone({ countries: ['GB'] })
    await seedMethod(zone.id, { name: 'Standard', rate: 500, position: 0 })
    await seedMethod(zone.id, { name: 'Express', rate: 1_500, position: 1 })

    const quotes = await new ShippingService().quotesFor({
      destination: { country: 'GB' },
      subtotalAmount: 10_000,
      currency: 'USD',
    })

    assert.lengthOf(quotes, 2)
    assert.equal(quotes[0].amount, 500)
    assert.equal(quotes[1].amount, 1_500)
  })

  test('free above a threshold', async ({ assert }) => {
    const zone = await seedZone({ countries: ['GB'] })
    await seedMethod(zone.id, { rate: 500, freeAbove: 5_000 })

    const service = new ShippingService()
    const context = { destination: { country: 'GB' }, currency: 'USD' }

    const under = await service.quotesFor({ ...context, subtotalAmount: 4_999 })
    const over = await service.quotesFor({ ...context, subtotalAmount: 5_000 })

    assert.equal(under[0].amount, 500)
    assert.equal(over[0].amount, 0)
    assert.isTrue(over[0].free)
  })

  test('a null threshold is not the same as zero', async ({ assert }) => {
    const zone = await seedZone({ countries: ['GB'] })
    await seedMethod(zone.id, { rate: 500, freeAbove: null })

    const quotes = await new ShippingService().quotesFor({
      destination: { country: 'GB' },
      subtotalAmount: 1_000_000,
      currency: 'USD',
    })

    /**
     * `null` means "no free shipping"; `0` would make every order free. Storing
     * one as the other is the kind of mistake that only shows up in the
     * accounts.
     */
    assert.equal(quotes[0].amount, 500)
  })

  test('refuses a method that does not apply to the address', async ({ assert }) => {
    const uk = await seedZone({ name: 'UK', countries: ['GB'] })
    const japan = await seedZone({ name: 'JP', countries: ['JP'] })
    const ukMethod = await seedMethod(uk.id, { rate: 500 })
    await seedMethod(japan.id, { rate: 9_000 })

    /**
     * A method id from another zone must not resolve — otherwise a tampered
     * request picks the cheapest rate in the whole shop for any destination.
     */
    await assert.rejects(
      () =>
        new ShippingService().rateFor(ukMethod.id, {
          destination: { country: 'JP' },
          subtotalAmount: 10_000,
          currency: 'USD',
        }),
      /not available for this address/i
    )
  })

  test('a disabled method is not offered', async ({ assert }) => {
    const zone = await seedZone({ countries: ['GB'] })
    const method = await seedMethod(zone.id, { rate: 500 })
    method.enabled = false
    await method.save()

    const quotes = await new ShippingService().quotesFor({
      destination: { country: 'GB' },
      subtotalAmount: 10_000,
      currency: 'USD',
    })

    assert.isEmpty(quotes)
  })

  test('omits a method with no rate in the order currency', async ({ assert }) => {
    const zone = await seedZone({ countries: ['GB'] })
    await seedMethod(zone.id, { rate: 500 })
    await StoreCurrency.create({ id: newUlid(), code: 'EUR', enabled: true, position: 0 })

    /**
     * The same rule as product prices: amounts are minor units, so reusing the
     * base rate would charge ¥500 for something priced $5.00. No conversion
     * exists anywhere in this module.
     */
    const quotes = await new ShippingService().quotesFor({
      destination: { country: 'GB' },
      subtotalAmount: 10_000,
      currency: 'EUR',
    })

    assert.isEmpty(quotes)
  })

  test('uses the listed rate once one exists for that currency', async ({ assert }) => {
    const zone = await seedZone({ countries: ['GB'] })
    const method = await seedMethod(zone.id, { rate: 500 })
    await StoreCurrency.create({ id: newUlid(), code: 'EUR', enabled: true, position: 0 })
    await ShippingRate.create({
      id: newUlid(),
      methodId: method.id,
      currency: 'EUR',
      rateAmount: 450,
      freeAboveAmount: null,
    })

    const quotes = await new ShippingService().quotesFor({
      destination: { country: 'GB' },
      subtotalAmount: 10_000,
      currency: 'EUR',
    })

    assert.lengthOf(quotes, 1)
    assert.equal(quotes[0].amount, 450)
  })
})

test.group('E-commerce | shipping at checkout', (group) => {
  group.each.setup(async () => resetDatabase())

  test('charges the chosen method', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const zone = await seedZone({ countries: ['GB'] })
    const express = await seedMethod(zone.id, { name: 'Express', rate: 1_500 })

    const result = await checkout(variant.id, { shippingMethodId: express.id })
    const order = await Order.findOrFail(result.orderId)

    assert.equal(order.shippingAmount, 1_500)
    assert.equal(order.totalAmount, 11_500)
    assert.equal(order.shippingMethodLabel, 'Express')
  })

  test('falls back to the cheapest option when none is chosen', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const zone = await seedZone({ countries: ['GB'] })
    await seedMethod(zone.id, { name: 'Express', rate: 1_500, position: 0 })
    await seedMethod(zone.id, { name: 'Standard', rate: 500, position: 1 })

    const result = await checkout(variant.id)
    const order = await Order.findOrFail(result.orderId)

    /**
     * Charging nothing would be a silent loss that only shows up in the
     * accounts. The cheapest is the defensible default.
     */
    assert.equal(order.shippingAmount, 500)
    assert.equal(order.shippingMethodLabel, 'Standard')
  })

  test('the client cannot send a rate, only a method id', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const zone = await seedZone({ countries: ['GB'] })
    const method = await seedMethod(zone.id, { rate: 1_500 })

    const result = await checkout(variant.id, {
      shippingMethodId: method.id,
      // Not a field the service reads; here to prove it is ignored.
      shippingAmount: 1,
    })

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.shippingAmount, 1_500)
  })

  test('refuses an address the shop does not deliver to', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const zone = await seedZone({ name: 'UK only', countries: ['GB'] })
    await seedMethod(zone.id, { rate: 500 })

    await assert.rejects(
      () => checkout(variant.id, { shippingAddress: { ...UK_ADDRESS, country: 'JP' } }),
      /do not deliver/i
    )
  })

  test('a digital-only basket is never charged shipping', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 'digital')
    const zone = await seedZone({ countries: [] })
    await seedMethod(zone.id, { rate: 9_999 })

    const result = await checkout(variant.id, { shippingAddress: undefined })
    const order = await Order.findOrFail(result.orderId)

    assert.equal(order.shippingAmount, 0)
    assert.equal(order.totalAmount, 10_000)
  })

  test('a store with no zones still checks out, free', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)

    /**
     * Every shop worked this way before shipping existed. Demanding a choice
     * the shop cannot offer would lock out every physical order on upgrade.
     */
    const result = await checkout(variant.id)
    const order = await Order.findOrFail(result.orderId)

    assert.equal(order.shippingAmount, 0)
    assert.equal(order.totalAmount, 10_000)
  })

  test('quotes in the basket currency', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const zone = await seedZone({ countries: ['GB'] })
    const method = await seedMethod(zone.id, { rate: 500 })

    await StoreCurrency.create({ id: newUlid(), code: 'EUR', enabled: true, position: 0 })
    await VariantPrice.create({
      id: newUlid(),
      variantId: variant.id,
      currency: 'EUR',
      priceAmount: 9_000,
    })
    await ShippingRate.create({
      id: newUlid(),
      methodId: method.id,
      currency: 'EUR',
      rateAmount: 450,
      freeAboveAmount: null,
    })

    const result = await checkout(variant.id, {
      currency: 'EUR',
      shippingMethodId: method.id,
    })

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.currency, 'EUR')
    assert.equal(order.shippingAmount, 450)
    assert.equal(order.totalAmount, 9_450)
  })

  test('the storefront quotes options for an address', async ({ client, assert }) => {
    const { variant } = await seedProduct(10_000)
    const zone = await seedZone({ countries: ['GB'] })
    await seedMethod(zone.id, { name: 'Standard', rate: 500 })

    const added = await client
      .post('/api/shop/cart/items')
      .json({ variantId: variant.id, quantity: 1 })
    const cart = added.cookie('dl_cart')?.value ?? ''

    const res = await client
      .post('/api/shop/shipping/options')
      .withCookie('dl_cart', cart)
      .json({ country: 'GB' })

    res.assertStatus(200)
    assert.isTrue(res.body().required)
    assert.lengthOf(res.body().options, 1)
    assert.equal(res.body().options[0].price.amount, 500)
  })

  test('the storefront says shipping is not required for downloads', async ({ client, assert }) => {
    const { variant } = await seedProduct(10_000, 'digital')
    const zone = await seedZone({ countries: [] })
    await seedMethod(zone.id, { rate: 500 })

    const added = await client
      .post('/api/shop/cart/items')
      .json({ variantId: variant.id, quantity: 1 })
    const cart = added.cookie('dl_cart')?.value ?? ''

    const res = await client
      .post('/api/shop/shipping/options')
      .withCookie('dl_cart', cart)
      .json({ country: 'GB' })

    res.assertStatus(200)
    assert.isFalse(res.body().required)
    assert.isEmpty(res.body().options)
  })
})

test.group('E-commerce | fulfilment', (group) => {
  group.each.setup(async () => resetDatabase())

  /** Buy and pay, so the order is in a state that can ship. */
  async function paidOrder() {
    const { variant } = await seedProduct(10_000)
    const result = await checkout(variant.id)

    const payment = await db
      .from('ecommerce_payments')
      .where('order_id', result.orderId)
      .firstOrFail()

    await new OrderService().markOrderPaid(result.orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: result.total.amount,
      currency: 'USD',
      source: 'webhook',
    })

    return result.orderId
  }

  test('records the carrier and tracking number', async ({ assert }) => {
    const orderId = await paidOrder()

    await new OrderService().markShipped(
      orderId,
      { carrier: 'Royal Mail', trackingNumber: 'RM123', trackingUrl: 'https://track.test/RM123' },
      { type: 'system' }
    )

    const order = await Order.findOrFail(orderId)
    assert.equal(order.carrier, 'Royal Mail')
    assert.equal(order.trackingNumber, 'RM123')
    assert.equal(order.fulfillmentStatus, 'fulfilled')
    assert.equal(order.status, 'fulfilled')
    assert.isNotNull(order.shippedAt)
  })

  test('refuses a tracking link that is not http', async ({ assert }) => {
    const orderId = await paidOrder()

    /**
     * That link goes into an email and onto a page the buyer clicks. A
     * `javascript:` URL there is stored XSS with extra steps.
     */
    await assert.rejects(
      () =>
        new OrderService().markShipped(
          orderId,
          { trackingUrl: 'javascript:alert(1)' },
          { type: 'system' }
        ),
      /must start with http/i
    )

    const order = await Order.findOrFail(orderId)
    assert.isNull(order.trackingUrl)
    assert.isNull(order.shippedAt)
  })

  test('will not ship an unpaid order', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const result = await checkout(variant.id)

    await assert.rejects(
      () => new OrderService().markShipped(result.orderId, { carrier: 'X' }, { type: 'system' }),
      /has not been paid/i
    )
  })

  test('correcting the details does not re-stamp the ship date', async ({ assert }) => {
    const orderId = await paidOrder()
    const service = new OrderService()

    await service.markShipped(orderId, { trackingNumber: 'TYPO' }, { type: 'system' })
    const first = (await Order.findOrFail(orderId)).shippedAt

    await service.markShipped(orderId, { trackingNumber: 'CORRECT' }, { type: 'system' })
    const order = await Order.findOrFail(orderId)

    /**
     * The date is what the notification is keyed on. Re-stamping it would tell
     * the buyer their parcel shipped a second time.
     */
    assert.equal(order.trackingNumber, 'CORRECT')
    assert.equal(order.shippedAt?.toISO(), first?.toISO())
  })

  test('records a distinct event for a correction', async ({ assert }) => {
    const orderId = await paidOrder()
    const service = new OrderService()

    await service.markShipped(orderId, { carrier: 'A' }, { type: 'system' })
    await service.markShipped(orderId, { carrier: 'B' }, { type: 'system' })

    const events = await db.from('ecommerce_order_events').where('order_id', orderId)
    const types = events.map((e) => String(e.type))

    assert.include(types, 'order.shipped')
    assert.include(types, 'order.shipment_updated')
  })

  test('the shipment email carries the tracking details', async ({ assert }) => {
    const orderId = await paidOrder()

    await new OrderService().markShipped(
      orderId,
      { carrier: 'Royal Mail', trackingNumber: 'RM123', trackingUrl: 'https://track.test/RM123' },
      { type: 'system' }
    )

    const context = await new OrderNotifierService().buildShipmentNotice(orderId)

    assert.isNotNull(context)
    assert.equal(context!.carrier, 'Royal Mail')
    assert.equal(context!.trackingNumber, 'RM123')
    assert.equal(context!.trackingUrl, 'https://track.test/RM123')
    // The order link still works — same encrypted-token path as the receipt.
    assert.isString(context!.orderUrl)
  })

  test('a failing mailer never un-ships an order', async ({ assert }) => {
    const notifier = new OrderNotifierService()

    // Same rule as the receipt: it swallows everything and reports failure.
    assert.isFalse(await notifier.sendShipmentNotice('does-not-exist'))
    assert.isNull(await notifier.buildShipmentNotice('does-not-exist'))
  })

  test('the buyer sees the tracking on their order page', async ({ client, assert }) => {
    const { variant } = await seedProduct(10_000)
    const result = await checkout(variant.id)

    const payment = await db
      .from('ecommerce_payments')
      .where('order_id', result.orderId)
      .firstOrFail()
    await new OrderService().markOrderPaid(result.orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: result.total.amount,
      currency: 'USD',
      source: 'webhook',
    })

    await new OrderService().markShipped(
      result.orderId,
      { carrier: 'Royal Mail', trackingNumber: 'RM123' },
      { type: 'system' }
    )

    const res = await client.get(`/api/shop/order?token=${encodeURIComponent(result.accessToken)}`)

    res.assertStatus(200)
    assert.equal(res.body().carrier, 'Royal Mail')
    assert.equal(res.body().trackingNumber, 'RM123')
    assert.isString(res.body().shippedAt)
  })

  test('the ship endpoint needs orders:manage', async ({ client }) => {
    const orderId = await paidOrder()

    const reader = await (async () => {
      const { default: User } = await import('#models/user')
      const { default: Role } = await import('#models/role')
      const { default: Permission } = await import('#models/permission')

      const role = await Role.create({
        id: newUlid(),
        name: `T_${newUlid().slice(-8)}`,
        description: 'read only',
        isSystem: false,
      })
      const perms = await Permission.query().whereIn('name', ['ecommerce:orders:read'])
      await role.related('permissions').attach(perms.map((p) => p.id))

      const user = await User.create({
        email: `r-${newUlid().toLowerCase().slice(-8)}@example.com`,
        password: 'password123',
        username: `r${newUlid().toLowerCase().slice(-8)}`,
        status: 'ACTIVE',
      })
      await user.related('roles').attach([role.id])
      return user
    })()

    const res = await client
      .post(`/api/admin/ecommerce/orders/${orderId}/ship`)
      .loginAs(reader)
      .json({ carrier: 'X' })

    res.assertStatus(403)
  })
})

test.group('E-commerce | country codes', (group) => {
  group.each.setup(async () => resetDatabase())

  /** The seeded owner. Every settings endpoint sits behind a permission. */
  async function owner() {
    const { default: User } = await import('#models/user')
    return User.query().where('email', 'admin@driftless.local').firstOrFail()
  }

  /** A basket with something in it, and the cookie that identifies it. */
  async function basket(client: ApiClient) {
    const { variant } = await seedProduct(10_000)
    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    return cart.cookie('dl_cart')?.value ?? ''
  }

  test('checkout refuses a country that is not a country', async ({ client, assert }) => {
    const cart = await basket(client)

    /**
     * The public half of this, and the reason it is worth a check at all:
     * anyone may POST here. A zone matches an address on exact string equality,
     * so an order carrying `ZZ` is quoted nothing and ships nowhere — and that
     * only surfaces days later, as a fulfilment problem rather than a bad field.
     */
    const res = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cart)
      .header('idempotency-key', 'unknown-country')
      .json({
        email: 'buyer@example.com',
        gateway: 'stripe',
        shippingAddress: { ...UK_ADDRESS, country: 'ZZ' },
      })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'validation_failed' })

    // The message is rendered straight back to the sender; it must not carry
    // their string with it.
    assert.notInclude(res.body().message, 'ZZ')
    assert.isEmpty(await Order.all())
  })

  test('a lowercase country code is accepted and stored uppercase', async ({ client, assert }) => {
    const cart = await basket(client)

    const res = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cart)
      .header('idempotency-key', 'lowercase-country')
      .json({
        email: 'buyer@example.com',
        gateway: 'stripe',
        shippingAddress: { ...UK_ADDRESS, city: 'Jakarta', country: 'id' },
      })

    res.assertStatus(201)

    /**
     * `id` means Indonesia — refusing it would be pedantry. Storing it that way
     * would not be: zones compare exact strings, so the lowercase form would
     * match no zone at all.
     */
    const order = await Order.findOrFail(res.body().orderId)
    assert.equal(order.shippingAddress.country, 'ID')
  })

  test('a shipping zone cannot name a country that does not exist', async ({ client, assert }) => {
    const existing = await seedZone({ name: 'UK', countries: ['GB'] })

    const res = await client
      .put('/api/admin/ecommerce/shipping')
      .loginAs(await owner())
      .json({
        zones: [{ name: 'Europe', countries: ['GB', 'QQ'], states: [], methods: [] }],
      })

    /**
     * Refused, not quietly dropped. A zone that covers one country fewer than
     * the operator typed looks entirely correct on screen, and the first sign
     * of it is a buyer who cannot be quoted a rate.
     */
    res.assertStatus(422)
    assert.notInclude(res.body().message, 'QQ')

    /**
     * The rebuild opens by deleting every zone, so a payload rejected late
     * would cost the shop its whole shipping configuration. The check runs
     * first; nothing moved.
     */
    const zones = await ShippingZone.all()
    assert.lengthOf(zones, 1)
    assert.equal(zones[0].id, existing.id)
    assert.deepEqual(zones[0].countries, ['GB'])
  })
})
