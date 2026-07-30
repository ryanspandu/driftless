import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import Discount from '#modules/ecommerce/models/discount'
import Affiliate from '#modules/ecommerce/models/affiliate'
import Commission from '#modules/ecommerce/models/commission'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import OrderService from '#modules/ecommerce/services/order_service'
import DiscountService from '#modules/ecommerce/services/discount_service'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'
import RefundService from '#modules/ecommerce/services/refund_service'
import PricingService from '#modules/ecommerce/services/pricing_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'

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

async function superadmin() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/** A user granted exactly these permission codes and nothing else. */
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

async function seedProduct(price = 10_000, stock = 20) {
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
    optionValues: {},
    stockOnHand: stock,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

async function checkout(variantId: string, extra: Record<string, unknown> = {}) {
  return new CheckoutService().start({
    lines: [{ variantId, quantity: 1 }],
    email: 'buyer@example.com',
    gateway: 'stripe',
    successUrl: 'https://shop.test/thanks',
    cancelUrl: 'https://shop.test/cart',
    ...extra,
  })
}

test.group('E-commerce | discounts', (group) => {
  group.each.setup(async () => resetDatabase())

  test('applies a percentage off the subtotal', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await new DiscountService().create({ code: 'SAVE10', type: 'percent', value: 10 })

    const result = await checkout(variant.id, { discountCode: 'SAVE10' })

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.subtotalAmount, 10_000)
    assert.equal(order.discountAmount, 1_000)
    assert.equal(order.totalAmount, 9_000)
    assert.equal(order.discountCode, 'SAVE10')
  })

  test('applies a fixed amount off the basket', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await new DiscountService().create({ code: 'TENOFF', type: 'fixed', value: 1_000 })

    const result = await checkout(variant.id, { discountCode: 'TENOFF' })
    const order = await Order.findOrFail(result.orderId)

    assert.equal(order.discountAmount, 1_000)
    assert.equal(order.totalAmount, 9_000)
  })

  test('never discounts more than the basket is worth', async ({ assert }) => {
    const { variant } = await seedProduct(500)
    await new DiscountService().create({ code: 'BIG', type: 'fixed', value: 10_000 })

    /**
     * A discount larger than the basket must clamp, not go negative — a
     * negative total is a refund dressed up as a sale, and every gateway
     * rejects it anyway.
     */
    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])
    const evaluation = await new DiscountService().validate('BIG', priced, null)
    assert.equal(evaluation.amount, 500)

    /**
     * And a basket the clamp takes to nothing checks out for free rather than
     * being sent to a gateway that cannot charge zero — while still consuming
     * the code, so a 100%-off coupon with a quota is spent exactly once.
     */
    const result = await checkout(variant.id, { discountCode: 'BIG' })

    assert.isTrue(result.paid)
    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.discountAmount, 500)
    assert.equal(order.totalAmount, 0)
    assert.equal(order.paymentStatus, 'paid')

    const discount = await Discount.findByOrFail('code', 'BIG')
    assert.equal(discount.usageCount, 1)
  })

  test('normalises the code so case does not matter', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await new DiscountService().create({ code: 'save10', type: 'percent', value: 10 })

    const result = await checkout(variant.id, { discountCode: '  SaVe10 ' })
    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.discountAmount, 1_000)
  })

  test('refuses an unknown code without revealing that it is unknown', async ({ assert }) => {
    const { variant } = await seedProduct()

    await assert.rejects(
      () => checkout(variant.id, { discountCode: 'NOPE' }),
      /not valid for this basket/i
    )
  })

  test('refuses an expired or not-yet-started code', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 50)
    const service = new DiscountService()

    await service.create({
      code: 'EXPIRED',
      type: 'percent',
      value: 10,
      endsAt: DateTime.now().minus({ days: 1 }).toISO(),
    })
    await service.create({
      code: 'FUTURE',
      type: 'percent',
      value: 10,
      startsAt: DateTime.now().plus({ days: 1 }).toISO(),
    })

    await assert.rejects(() => checkout(variant.id, { discountCode: 'EXPIRED' }))
    await assert.rejects(() => checkout(variant.id, { discountCode: 'FUTURE' }))
  })

  test('refuses a disabled code', async ({ assert }) => {
    const { variant } = await seedProduct()
    const service = new DiscountService()
    const created = await service.create({ code: 'OFF', type: 'percent', value: 10 })
    await service.update(created.id, { enabled: false })

    await assert.rejects(() => checkout(variant.id, { discountCode: 'OFF' }))
  })

  test('enforces a minimum spend', async ({ assert }) => {
    const { variant } = await seedProduct(1_000)
    await new DiscountService().create({
      code: 'BIGSPEND',
      type: 'percent',
      value: 10,
      minSubtotalAmount: 5_000,
    })

    await assert.rejects(() => checkout(variant.id, { discountCode: 'BIGSPEND' }), /Spend/i)
  })

  test('caps a percentage discount at its maximum', async ({ assert }) => {
    const { variant } = await seedProduct(100_000)
    await new DiscountService().create({
      code: 'CAPPED',
      type: 'percent',
      value: 50,
      maxDiscountAmount: 2_000,
    })

    const result = await checkout(variant.id, { discountCode: 'CAPPED' })
    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.discountAmount, 2_000, '50% of 1000.00 is capped at 20.00')
  })

  test('stops honouring a code once its total limit is reached', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 50)
    await new DiscountService().create({
      code: 'ONCE',
      type: 'percent',
      value: 10,
      usageLimit: 1,
    })

    await checkout(variant.id, { discountCode: 'ONCE' })

    /**
     * The quota is claimed by a conditional UPDATE, so this holds even when two
     * checkouts race — the database decides, not application code.
     */
    await assert.rejects(() => checkout(variant.id, { discountCode: 'ONCE' }))

    const discount = await Discount.findByOrFail('code', 'ONCE')
    assert.equal(discount.usageCount, 1, 'never more uses than the limit allows')
  })

  test('enforces a per-customer limit across guest checkouts', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 50)
    await new DiscountService().create({
      code: 'ONEEACH',
      type: 'percent',
      value: 10,
      usageLimitPerCustomer: 1,
    })

    await checkout(variant.id, { discountCode: 'ONEEACH', email: 'repeat@example.com' })

    /**
     * The cap is keyed on a hash of the email, so it applies to guest checkouts
     * too — a shopper cannot dodge it simply by not making an account.
     */
    await assert.rejects(
      () => checkout(variant.id, { discountCode: 'ONEEACH', email: 'repeat@example.com' }),
      /already used/i
    )

    // A different shopper is unaffected.
    const other = await checkout(variant.id, {
      discountCode: 'ONEEACH',
      email: 'someone-else@example.com',
    })
    const order = await Order.findOrFail(other.orderId)
    assert.equal(order.discountAmount, 1_000)
  })

  test('returns the use when an unpaid order expires', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 50)
    await new DiscountService().create({
      code: 'RECLAIM',
      type: 'percent',
      value: 10,
      usageLimit: 1,
    })

    const result = await checkout(variant.id, { discountCode: 'RECLAIM' })
    assert.equal((await Discount.findByOrFail('code', 'RECLAIM')).usageCount, 1)

    await Order.query()
      .where('id', result.orderId)
      .update({ reservation_expires_at: DateTime.now().minus({ hours: 1 }).toSQL() })
    await new OrderService().expireStaleOrders()

    /**
     * Otherwise anyone could burn a limited promotion to zero by starting
     * checkouts and walking away.
     */
    assert.equal(
      (await Discount.findByOrFail('code', 'RECLAIM')).usageCount,
      0,
      'an abandoned checkout must not permanently consume a use'
    )
  })

  test('the storefront check never distinguishes unknown from ineligible', async ({
    client,
    assert,
  }) => {
    const { variant } = await seedProduct(1_000)
    await new DiscountService().create({
      code: 'REAL',
      type: 'percent',
      value: 10,
      minSubtotalAmount: 999_999,
    })

    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    const cookie = cart.cookie('dl_cart')?.value ?? ''

    const unknown = await client
      .post('/api/shop/discount/check')
      .withCookie('dl_cart', cookie)
      .json({ code: 'DOESNOTEXIST' })

    const ineligible = await client
      .post('/api/shop/discount/check')
      .withCookie('dl_cart', cookie)
      .json({ code: 'REAL' })

    // Both are refused; neither confirms whether the code exists.
    assert.equal(unknown.status(), 422)
    assert.equal(ineligible.status(), 422)
  })

  test('reading discounts does not permit editing them', async ({ client }) => {
    const reader = await userWith(['ecommerce:discounts:read'])

    const read = await client.get('/api/admin/ecommerce/discounts').loginAs(reader)
    read.assertStatus(200)

    const write = await client
      .post('/api/admin/ecommerce/discounts')
      .loginAs(reader)
      .json({ code: 'SNEAKY', type: 'percent', value: 50 })
    write.assertStatus(403)
  })

  test('refuses a duplicate code', async ({ client }) => {
    const admin = await superadmin()
    await client
      .post('/api/admin/ecommerce/discounts')
      .loginAs(admin)
      .json({ code: 'DUPE', type: 'percent', value: 10 })

    const clash = await client
      .post('/api/admin/ecommerce/discounts')
      .loginAs(admin)
      .json({ code: 'dupe', type: 'percent', value: 20 })

    clash.assertStatus(409)
    clash.assertBodyContains({ reason: 'code_taken' })
  })

  test('refuses a percentage outside 0–100', async ({ client }) => {
    const admin = await superadmin()
    const res = await client
      .post('/api/admin/ecommerce/discounts')
      .loginAs(admin)
      .json({ code: 'WILD', type: 'percent', value: 150 })

    res.assertStatus(422)
  })
})

test.group('E-commerce | affiliates', (group) => {
  group.each.setup(async () => resetDatabase())

  async function seedAffiliate(percent = 10) {
    return new AffiliateService().create({
      code: 'PARTNER',
      name: 'A Partner',
      email: 'partner@example.com',
      commissionPercent: percent,
    })
  }

  test('a referral link redirects and sets the attribution cookie', async ({ client, assert }) => {
    await seedAffiliate()

    const res = await client.get('/ref/PARTNER?to=/products').redirects(0)
    assert.oneOf(res.status(), [302, 303])
    assert.equal(res.header('location'), '/products')
    assert.isNotEmpty(res.cookie('dl_ref')?.value ?? '')

    const affiliate = await Affiliate.findByOrFail('code', 'PARTNER')
    assert.equal(affiliate.clicksCount, 1)
  })

  test('an unknown code still redirects but records nothing', async ({ client, assert }) => {
    const res = await client.get('/ref/NOTREAL').redirects(0)

    // A 404 here would tell whoever is probing which codes exist.
    assert.oneOf(res.status(), [302, 303])

    const clicks = await db.from('ecommerce_affiliate_clicks').count('* as total').first()
    assert.equal(Number((clicks as { total?: string | number } | undefined)?.total ?? 0), 0)
  })

  test('refuses to redirect off-site', async ({ client, assert }) => {
    await seedAffiliate()

    /**
     * Honouring an absolute `?to=` would turn this into an open redirect that
     * borrows the shop's domain for a phishing link.
     */
    for (const target of ['https://evil.example.com', '//evil.example.com']) {
      const res = await client.get(`/ref/PARTNER?to=${encodeURIComponent(target)}`).redirects(0)
      assert.equal(res.header('location'), '/')
    }
  })

  test('attribution comes from the cookie, never from the request body', async ({
    client,
    assert,
  }) => {
    const earner = await seedAffiliate()
    const impostor = await new AffiliateService().create({
      code: 'IMPOSTOR',
      name: 'Someone Else',
      email: 'impostor@example.com',
      commissionPercent: 50,
    })
    const { variant } = await seedProduct(10_000)

    // The click is what earns — this is the only legitimate way to be credited.
    const click = await client.get('/ref/PARTNER').redirects(0)
    const ref = click.cookie('dl_ref')?.value ?? ''

    const added = await client
      .post('/api/shop/cart/items')
      .json({ variantId: variant.id, quantity: 1 })
    const cart = added.cookie('dl_cart')?.value ?? ''

    /**
     * A client-supplied affiliate code would let anyone credit any affiliate
     * for any sale — most obviously themselves. The checkout validator has no
     * such field, so the code below is simply ignored; this test is what keeps
     * it that way if someone later "helpfully" adds one.
     *
     * Sending a *different* code from the cookie's is what makes the assertion
     * meaningful: the commission has to exist, and it has to belong to the
     * affiliate whose link was actually clicked.
     */
    const res = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cart)
      .withCookie('dl_ref', ref)
      .header('idempotency-key', `k-${newUlid()}`)
      .json({
        email: 'buyer@example.com',
        gateway: 'stripe',
        affiliateCode: 'IMPOSTOR',
      })

    assert.equal(res.status(), 201)

    await new OrderService().markOrderPaid(String(res.body().orderId), {
      gatewayPaymentId: `pi_${newUlid()}`,
      amount: res.body().total.amount,
      currency: 'USD',
      source: 'webhook',
    })

    const commissions = await Commission.all()
    assert.lengthOf(commissions, 1)
    assert.equal(commissions[0].affiliateId, earner.id)
    assert.notEqual(commissions[0].affiliateId, impostor.id)
  })

  test('a paused affiliate earns nothing and sets no cookie', async ({ client, assert }) => {
    const created = await seedAffiliate()
    await new AffiliateService().update(created.id, { status: 'paused' })

    const res = await client.get('/ref/PARTNER').redirects(0)
    assert.isEmpty(res.cookie('dl_ref')?.value ?? '')
  })

  test('records a commission on the subtotal when the order is paid', async ({ assert }) => {
    await seedAffiliate(10)
    const { variant } = await seedProduct(10_000)

    const result = await checkout(variant.id, { affiliateCode: 'PARTNER' })
    const paymentId = [...fake.sessions.keys()][0]!
    fake.markPaid(paymentId)

    const order = await Order.findOrFail(result.orderId)
    await new OrderService().markOrderPaid(order.id, {
      gatewayPaymentId: paymentId,
      amount: order.totalAmount,
      currency: order.currency,
      source: 'webhook',
    })

    const commission = await Commission.findByOrFail('order_id', order.id)
    /**
     * A cut of the subtotal, not the total: paying a percentage of shipping and
     * tax means paying a cut of money that was never margin.
     */
    assert.equal(commission.amount, 1_000)
    assert.equal(commission.status, 'pending')
  })

  test('never records two commissions for one order', async ({ assert }) => {
    await seedAffiliate(10)
    const { variant } = await seedProduct(10_000)

    const result = await checkout(variant.id, { affiliateCode: 'PARTNER' })
    const paymentId = [...fake.sessions.keys()][0]!
    fake.markPaid(paymentId)

    const evidence = {
      gatewayPaymentId: paymentId,
      amount: 10_000,
      currency: 'USD',
      source: 'webhook' as const,
    }

    // A duplicate webhook delivery.
    await new OrderService().markOrderPaid(result.orderId, evidence)
    await new OrderService().markOrderPaid(result.orderId, evidence)

    const commissions = await Commission.query().where('order_id', result.orderId)
    assert.lengthOf(commissions, 1, 'a replayed payment must not pay twice for one sale')
  })

  test('holds commission until the refund window has passed', async ({ assert }) => {
    await seedAffiliate(10)
    const { variant } = await seedProduct(10_000)

    const result = await checkout(variant.id, { affiliateCode: 'PARTNER' })
    const paymentId = [...fake.sessions.keys()][0]!
    fake.markPaid(paymentId)
    await new OrderService().markOrderPaid(result.orderId, {
      gatewayPaymentId: paymentId,
      amount: 10_000,
      currency: 'USD',
      source: 'webhook',
    })

    const service = new AffiliateService()

    // Default refund window is 30 days, so nothing matures today.
    assert.equal(await service.approveMatured(), 0)

    // …but it does once the window has elapsed.
    assert.equal(await service.approveMatured(DateTime.now().plus({ days: 31 })), 1)

    const commission = await Commission.findByOrFail('order_id', result.orderId)
    assert.equal(commission.status, 'approved')
  })

  test('voids the commission when the order is refunded', async ({ assert }) => {
    await seedAffiliate(10)
    const { variant } = await seedProduct(10_000)

    const result = await checkout(variant.id, { affiliateCode: 'PARTNER' })
    const paymentId = [...fake.sessions.keys()][0]!
    fake.markPaid(paymentId)

    const order = await Order.findOrFail(result.orderId)
    await new OrderService().markOrderPaid(order.id, {
      gatewayPaymentId: paymentId,
      amount: order.totalAmount,
      currency: order.currency,
      source: 'webhook',
    })

    await new RefundService().refund(
      { orderId: order.id, amount: order.totalAmount },
      { type: 'user', id: '1', label: 'admin@driftless.local' }
    )

    /**
     * The sale was reversed, so the referral fee goes with it — otherwise a
     * refund cycle becomes a way to extract commission on sales that never
     * stood.
     */
    const commission = await Commission.findByOrFail('order_id', order.id)
    assert.equal(commission.status, 'void')
  })

  test('only approved commissions can be marked paid', async ({ assert }) => {
    await seedAffiliate(10)
    const { variant } = await seedProduct(10_000)

    const result = await checkout(variant.id, { affiliateCode: 'PARTNER' })
    const paymentId = [...fake.sessions.keys()][0]!
    fake.markPaid(paymentId)
    await new OrderService().markOrderPaid(result.orderId, {
      gatewayPaymentId: paymentId,
      amount: 10_000,
      currency: 'USD',
      source: 'webhook',
    })

    const commission = await Commission.findByOrFail('order_id', result.orderId)
    const service = new AffiliateService()

    // Still pending — nothing payable yet.
    await assert.rejects(() => service.markPaid([commission.id], 1), /approved/i)

    await service.approveMatured(DateTime.now().plus({ days: 31 }))
    assert.equal(await service.markPaid([commission.id], 1), 1)

    // Paying twice adds nothing: the guard is on the current status.
    await assert.rejects(() => service.markPaid([commission.id], 1))

    const affiliate = await Affiliate.findByOrFail('code', 'PARTNER')
    assert.equal(affiliate.paidCommissionAmount, 1_000)
    assert.equal(affiliate.outstandingAmount, 0)
  })

  test('payout details never leave the server', async ({ client, assert }) => {
    const SECRET = 'IBAN GB29 NWBK 6016 1331 9268 19'
    await new AffiliateService().create({
      code: 'BANKED',
      name: 'Banked',
      email: 'banked@example.com',
      commissionPercent: 5,
      payoutDetails: SECRET,
    })

    const admin = await superadmin()
    const res = await client.get('/api/admin/ecommerce/affiliates').loginAs(admin)

    assert.notInclude(JSON.stringify(res.body()), SECRET)
    assert.isTrue(res.body()[0].hasPayoutDetails)

    // …and it is genuinely encrypted at rest.
    const row = await db.from('ecommerce_affiliates').where('code', 'BANKED').first()
    assert.notInclude(String(row.payout_details_enc), SECRET)
  })

  test('managing affiliates does not permit recording payouts', async ({ client }) => {
    const manager = await userWith(['ecommerce:affiliates:read', 'ecommerce:affiliates:manage'])

    const read = await client.get('/api/admin/ecommerce/affiliates').loginAs(manager)
    read.assertStatus(200)

    /**
     * Recording that money left the building is a different job from editing a
     * referral rate.
     */
    const pay = await client
      .post('/api/admin/ecommerce/commissions/pay')
      .loginAs(manager)
      .json({ commissionIds: ['anything'] })
    pay.assertStatus(403)
  })

  test('rejects unauthenticated callers', async ({ client }) => {
    const discounts = await client.get('/api/admin/ecommerce/discounts')
    discounts.assertStatus(401)

    const affiliates = await client.get('/api/admin/ecommerce/affiliates')
    affiliates.assertStatus(401)
  })
})

test.group('E-commerce | discount arithmetic', (group) => {
  group.each.setup(async () => resetDatabase())

  test('spreads an order discount across lines so the parts sum to the whole', async ({
    assert,
  }) => {
    const first = await seedProduct(3_333)
    const second = await seedProduct(6_667)

    const priced = await new PricingService().price(
      [
        { variantId: first.variant.id, quantity: 1 },
        { variantId: second.variant.id, quantity: 1 },
      ],
      { discountAmount: 1_000 }
    )

    /**
     * Rounding each line independently would leave the line discounts
     * disagreeing with the order discount by a cent or two, which shows up as
     * an unbalanced invoice. Largest-remainder allocation makes it exact.
     */
    const allocated = priced.lines.reduce((sum, line) => sum + line.discountAmount, 0)
    assert.equal(allocated, 1_000)
    assert.equal(priced.totalAmount, 10_000 - 1_000)
  })
})
