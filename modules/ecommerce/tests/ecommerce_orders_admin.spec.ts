import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import OrderService from '#modules/ecommerce/services/order_service'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

let fake: FakeGatewayDriver

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  fake = new FakeGatewayDriver('stripe')
  overrideGateway('stripe', fake)
  await new StoreSettingsService().getOrCreate()

  return async () => {
    clearGatewayOverrides()
    await cleanup()
  }
}

/** SUPERADMIN holds `*`, so every `ecommerce:*` code. */
async function superadmin() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/**
 * A user granted exactly the listed permission codes — nothing else. Used to
 * prove the fine-grained split is real rather than decorative.
 */
async function userWith(codes: string[]) {
  const role = await Role.create({
    id: newUlid(),
    name: `TEST_${newUlid().slice(-8)}`,
    description: 'Scoped test role',
    isSystem: false,
  })

  const permissions = await Permission.query().whereIn('name', codes)
  await role.related('permissions').attach(permissions.map((p) => p.id))

  const user = await User.create({
    email: `scoped-${newUlid().toLowerCase().slice(-8)}@example.com`,
    password: 'password123',
    username: `scoped${newUlid().toLowerCase().slice(-8)}`,
    status: 'ACTIVE',
  })
  await user.related('roles').attach([role.id])
  return user
}

async function paidOrder(price = 1999) {
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
    priceFromAmount: price,
  })

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: price,
    // Deliberately set: this must never appear in any response.
    costAmount: 500,
    optionValues: {},
    stockOnHand: 10,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  const checkout = await new CheckoutService().start({
    lines: [{ variantId: variant.id, quantity: 1 }],
    email: 'buyer@example.com',
    gateway: 'stripe',
    successUrl: 'https://shop.test/thanks',
    cancelUrl: 'https://shop.test/cart',
  })

  const paymentId = [...fake.sessions.keys()][0]!
  fake.markPaid(paymentId)
  await new OrderService().markOrderPaid(checkout.orderId, {
    gatewayPaymentId: paymentId,
    amount: price,
    currency: 'USD',
    source: 'webhook',
  })

  return { orderId: checkout.orderId, variant, price }
}

test.group('E-commerce | orders admin', (group) => {
  group.each.setup(async () => resetDatabase())

  test('lists and shows an order with its timeline', async ({ client, assert }) => {
    const admin = await superadmin()
    const { orderId } = await paidOrder()

    const list = await client.get('/api/admin/ecommerce/orders').loginAs(admin)
    list.assertStatus(200)
    assert.lengthOf(list.body().items, 1)
    assert.equal(list.body().items[0].paymentStatus, 'paid')

    const detail = await client.get(`/api/admin/ecommerce/orders/${orderId}`).loginAs(admin)
    detail.assertStatus(200)
    assert.isAbove(detail.body().events.length, 0, 'the timeline is populated')
    assert.lengthOf(detail.body().payments, 1)
    assert.equal(detail.body().refundable.amount, 1999)
  })

  test('never exposes cost price in an order payload', async ({ client, assert }) => {
    const admin = await superadmin()
    const { orderId } = await paidOrder()

    const detail = await client.get(`/api/admin/ecommerce/orders/${orderId}`).loginAs(admin)
    const body = JSON.stringify(detail.body())

    /**
     * Cost of goods is margin data. Order items snapshot what was charged, not
     * what it cost — a leak here would put margin in front of anyone who can
     * read an order.
     */
    assert.notInclude(body, 'costAmount')
    assert.notInclude(body, 'cost_amount')
  })

  test('reading orders does not permit refunding them', async ({ client, assert }) => {
    const reader = await userWith(['ecommerce:orders:read', 'ecommerce:orders:manage'])
    const { orderId } = await paidOrder()

    const read = await client.get(`/api/admin/ecommerce/orders/${orderId}`).loginAs(reader)
    read.assertStatus(200)

    /**
     * The point of the split: fulfilling an order and moving money back out are
     * different jobs. `orders:manage` must not confer `orders:refund`.
     */
    const refund = await client
      .post(`/api/admin/ecommerce/orders/${orderId}/refund`)
      .loginAs(reader)
      .json({ amount: 100 })

    refund.assertStatus(403)

    const order = await Order.findOrFail(orderId)
    assert.equal(order.refundedAmount, 0)
  })

  test('read-only access cannot change status or cancel', async ({ client }) => {
    const reader = await userWith(['ecommerce:orders:read'])
    const { orderId } = await paidOrder()

    const status = await client
      .put(`/api/admin/ecommerce/orders/${orderId}/status`)
      .loginAs(reader)
      .json({ status: 'fulfilled' })
    status.assertStatus(403)

    const cancel = await client
      .post(`/api/admin/ecommerce/orders/${orderId}/cancel`)
      .loginAs(reader)
      .json({})
    cancel.assertStatus(403)
  })

  test('refunds through the API and reflects it in the payload', async ({ client, assert }) => {
    const admin = await superadmin()
    const { orderId } = await paidOrder(1999)

    const res = await client
      .post(`/api/admin/ecommerce/orders/${orderId}/refund`)
      .loginAs(admin)
      .json({ amount: 500, reason: 'Damaged in transit' })

    res.assertStatus(201)
    assert.equal(res.body().paymentStatus, 'partially_refunded')
    assert.equal(res.body().refunded.amount, 500)
    assert.equal(res.body().refundable.amount, 1499)
    assert.lengthOf(res.body().refunds, 1)
  })

  test('rejects a refund larger than what is left', async ({ client }) => {
    const admin = await superadmin()
    const { orderId } = await paidOrder(1999)

    const res = await client
      .post(`/api/admin/ecommerce/orders/${orderId}/refund`)
      .loginAs(admin)
      .json({ amount: 999_999 })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'refund_exceeds_total' })
  })

  test('rejects a fractional refund amount', async ({ client }) => {
    const admin = await superadmin()
    const { orderId } = await paidOrder()

    // Minor units are integers; a decimal means float money arithmetic somewhere.
    const res = await client
      .post(`/api/admin/ecommerce/orders/${orderId}/refund`)
      .loginAs(admin)
      .json({ amount: 19.99 })

    res.assertStatus(422)
  })

  test('refuses an illegal status transition', async ({ client }) => {
    const admin = await superadmin()
    const { orderId } = await paidOrder()

    await client
      .post(`/api/admin/ecommerce/orders/${orderId}/cancel`)
      .loginAs(admin)
      .json({ reason: 'Account changed their mind' })

    // A cancelled order is terminal — it cannot be fulfilled afterwards.
    const res = await client
      .put(`/api/admin/ecommerce/orders/${orderId}/status`)
      .loginAs(admin)
      .json({ status: 'fulfilled' })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'illegal_order_transition' })
  })

  test('cancelling a paid order restocks it', async ({ client, assert }) => {
    const admin = await superadmin()
    const { orderId, variant } = await paidOrder()

    await variant.refresh()
    assert.equal(variant.stockOnHand, 9, 'the sale took a unit off the shelf')

    await client
      .post(`/api/admin/ecommerce/orders/${orderId}/cancel`)
      .loginAs(admin)
      .json({ reason: 'Out of stock' })

    await variant.refresh()
    assert.equal(variant.stockOnHand, 10, 'cancelling a paid order puts it back')
  })

  test('rejects unauthenticated callers', async ({ client }) => {
    const list = await client.get('/api/admin/ecommerce/orders')
    list.assertStatus(401)
  })
})

test.group('E-commerce | gateway credentials admin', (group) => {
  group.each.setup(async () => resetDatabase())

  test('managing the store does not permit managing payment keys', async ({ client }) => {
    const operator = await userWith(['ecommerce:settings:manage'])

    /**
     * Holding the API keys is control of payment processing, which is a
     * different job from setting a tax rate.
     */
    const read = await client.get('/api/admin/ecommerce/gateways').loginAs(operator)
    read.assertStatus(403)

    const write = await client
      .put('/api/admin/ecommerce/gateways/stripe/live')
      .loginAs(operator)
      .json({ secretKey: 'sk_live_x' })
    write.assertStatus(403)
  })

  test('stores a key and never returns it', async ({ client, assert }) => {
    const admin = await superadmin()
    const SECRET = 'sk_test_abcdefghijklmnop'

    const saved = await client
      .put('/api/admin/ecommerce/gateways/stripe/test')
      .loginAs(admin)
      .json({ publicKey: 'pk_test_x', secretKey: SECRET, webhookSecret: 'whsec_x' })

    saved.assertStatus(200)
    assert.notInclude(JSON.stringify(saved.body()), SECRET)
    assert.isTrue(saved.body().hasSecretKey)
    assert.isTrue(saved.body().hasWebhookSecret)

    const listed = await client.get('/api/admin/ecommerce/gateways').loginAs(admin)
    assert.notInclude(JSON.stringify(listed.body()), SECRET)
    assert.notInclude(JSON.stringify(listed.body()), 'whsec_x')
  })

  test('editing another field keeps the stored key', async ({ client, assert }) => {
    const admin = await superadmin()
    const SECRET = 'sk_test_keepme'

    await client
      .put('/api/admin/ecommerce/gateways/stripe/test')
      .loginAs(admin)
      .json({ secretKey: SECRET })

    // No `secretKey` at all — the common case of toggling "enabled".
    await client
      .put('/api/admin/ecommerce/gateways/stripe/test')
      .loginAs(admin)
      .json({ enabled: true })

    const { default: GatewayCredentialsService } =
      await import('#modules/ecommerce/services/gateway_credentials_service')
    const resolved = await new GatewayCredentialsService().resolve('stripe')
    assert.equal(resolved.secretKey, SECRET, 'toggling enabled must not wipe the key')
    assert.equal(resolved.mode, 'test')
  })

  test('rejects an unknown gateway or mode', async ({ client }) => {
    const admin = await superadmin()

    const badGateway = await client
      .put('/api/admin/ecommerce/gateways/bitcoin/test')
      .loginAs(admin)
      .json({ enabled: false })
    badGateway.assertStatus(422)

    const badMode = await client
      .put('/api/admin/ecommerce/gateways/stripe/production')
      .loginAs(admin)
      .json({ enabled: false })
    badMode.assertStatus(422)
  })
})
