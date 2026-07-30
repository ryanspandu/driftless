import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductImage from '#modules/ecommerce/models/product_image'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import DigitalAsset from '#modules/ecommerce/models/digital_asset'
import DownloadGrant from '#modules/ecommerce/models/download_grant'
import Discount from '#modules/ecommerce/models/discount'
import Customer from '#modules/ecommerce/models/customer'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import DiscountService from '#modules/ecommerce/services/discount_service'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'
import OrderService from '#modules/ecommerce/services/order_service'
import PricingService from '#modules/ecommerce/services/pricing_service'
import OrderQueryService from '#modules/ecommerce/services/order_query_service'
import { stageOf } from '#modules/ecommerce/services/order_state_machine'
import RefundService from '#modules/ecommerce/services/refund_service'
import ManualOrderService from '#modules/ecommerce/services/manual_order_service'
import ExportService from '#modules/ecommerce/services/export_service'
import MaintenanceService from '#modules/ecommerce/services/maintenance_service'
import AnalyticsService from '#modules/ecommerce/services/analytics_service'
import Commission from '#modules/ecommerce/models/commission'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'
import { csvCell } from '#modules/ecommerce/services/csv'
import OrderNotifierService from '#modules/ecommerce/services/order_notifier_service'

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

async function seedProduct(price = 10_000, stock = 20, type: 'physical' | 'digital' = 'physical') {
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
    stockOnHand: stock,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

/** A real file on disk under the protected root, plus its asset row. */
async function seedAsset(
  variantId: string,
  options: { maxDownloads?: number; linkTtlHours?: number; contents?: string } = {}
) {
  const root = app.makePath('storage/protected/ecommerce')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })

  const id = newUlid()
  const storagePath = join(root, `${id}.txt`)
  writeFileSync(storagePath, options.contents ?? 'the goods')

  return DigitalAsset.create({
    id,
    variantId,
    filename: 'manual.txt',
    storagePath,
    mimeType: 'text/plain',
    sizeBytes: (options.contents ?? 'the goods').length,
    maxDownloads: options.maxDownloads ?? 0,
    linkTtlHours: options.linkTtlHours ?? 72,
  })
}

/** Buy one of `variantId` and pay for it. Returns the order and its token. */
async function buyAndPay(variantId: string) {
  const result = await new CheckoutService().start({
    lines: [{ variantId, quantity: 1 }],
    email: 'buyer@example.com',
    gateway: 'stripe',
    successUrl: 'https://shop.test/thanks',
    cancelUrl: 'https://shop.test/cart',
  })

  /**
   * The real payment id, read back from our own row — the same thing a webhook
   * would carry. Inventing one would leave the payment row uncaptured and make
   * a later refund fail for a reason that has nothing to do with the test.
   */
  const payment = await db
    .from('ecommerce_payments')
    .where('order_id', result.orderId)
    .firstOrFail()

  await new OrderService().markOrderPaid(result.orderId, {
    gatewayPaymentId: String(payment.gateway_payment_id),
    amount: result.total.amount,
    currency: result.total.currency,
    source: 'webhook',
  })

  return { orderId: result.orderId, token: result.accessToken }
}

test.group('E-commerce | digital delivery', (group) => {
  group.each.setup(async () => resetDatabase())

  test('issues a grant for each digital line when the order is paid', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)

    const grants = await DownloadGrant.query().where('order_id', orderId)
    assert.lengthOf(grants, 1)
    assert.equal(grants[0].downloadsCount, 0)
  })

  test('issues nothing for a physical product', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'physical')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)

    assert.lengthOf(await DownloadGrant.query().where('order_id', orderId), 0)
  })

  test('issues nothing before the order is paid', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    assert.lengthOf(await DownloadGrant.all(), 0)
  })

  test('a replayed payment does not mint a second set of grants', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)

    // The same webhook again. `markOrderPaid` is the guard; this proves grants
    // sit behind it rather than beside it.
    const payment = await db.from('ecommerce_payments').where('order_id', orderId).firstOrFail()
    await new OrderService().markOrderPaid(orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: 2_500,
      currency: 'USD',
      source: 'webhook',
    })

    assert.lengthOf(await DownloadGrant.query().where('order_id', orderId), 1)
  })

  test('serves the file to whoever holds the order token', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id, { contents: 'chapter one' })

    const { orderId, token } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()

    const res = await client.get(`/shop/download/${grant.id}?token=${encodeURIComponent(token)}`)

    res.assertStatus(200)
    assert.equal(res.text(), 'chapter one')
    // Never `inline`: a file the store did not author must not render in its
    // own origin.
    assert.include(String(res.header('content-disposition')), 'attachment')
    assert.equal(res.header('x-content-type-options'), 'nosniff')

    await grant.refresh()
    assert.equal(grant.downloadsCount, 1)
  })

  test('refuses a valid grant id with the wrong order token', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()

    const res = await client.get(`/shop/download/${grant.id}?token=not-the-right-token`)

    res.assertStatus(404)
    await grant.refresh()
    // The counter must not move on a refusal, or a wrong guess would drain the
    // buyer's quota.
    assert.equal(grant.downloadsCount, 0)
  })

  test('refuses another order token for the same file', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 10, 'digital')
    await seedAsset(variant.id)

    const mine = await buyAndPay(variant.id)
    const theirs = await buyAndPay(variant.id)

    const myGrant = await DownloadGrant.query().where('order_id', mine.orderId).firstOrFail()

    /**
     * Both buyers bought the same file, so the asset is shared — but a grant
     * belongs to one order, and one order's token must not open another's.
     */
    const res = await client.get(
      `/shop/download/${myGrant.id}?token=${encodeURIComponent(theirs.token)}`
    )

    res.assertStatus(404)
    await myGrant.refresh()
    assert.equal(myGrant.downloadsCount, 0)
  })

  test('stops at the download limit', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id, { maxDownloads: 2 })

    const { orderId, token } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()
    const url = `/shop/download/${grant.id}?token=${encodeURIComponent(token)}`

    ;(await client.get(url)).assertStatus(200)
    ;(await client.get(url)).assertStatus(200)
    ;(await client.get(url)).assertStatus(404)

    await grant.refresh()
    assert.equal(grant.downloadsCount, 2)
  })

  test('stops once the link has expired', async ({ client }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId, token } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()

    grant.expiresAt = DateTime.now().minus({ hours: 1 })
    await grant.save()

    const res = await client.get(`/shop/download/${grant.id}?token=${encodeURIComponent(token)}`)
    res.assertStatus(404)
  })

  test('a full refund revokes the downloads', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId, token } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()

    await new RefundService().refund({ orderId, amount: 2_500 }, { type: 'system' })

    await grant.refresh()
    assert.isNotNull(grant.revokedAt)

    const res = await client.get(`/shop/download/${grant.id}?token=${encodeURIComponent(token)}`)
    res.assertStatus(404)
  })

  test('a partial refund leaves the downloads alone', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)

    // A price adjustment on an order the buyer still has.
    await new RefundService().refund({ orderId, amount: 500 }, { type: 'system' })

    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()
    assert.isNull(grant.revokedAt)
  })

  test('an admin can revoke a single grant', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()

    const res = await client
      .post(`/api/admin/ecommerce/grants/${grant.id}/revoke`)
      .loginAs(await superadmin())

    res.assertStatus(200)
    await grant.refresh()
    assert.isNotNull(grant.revokedAt)
  })

  test('revoking a download needs the refund permission, not just orders:manage', async ({
    client,
  }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)
    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()

    /**
     * Taking back something already paid for is the same class of decision as
     * moving money, so it must not ride along with fulfilment editing.
     */
    const manager = await userWith(['ecommerce:orders:read', 'ecommerce:orders:manage'])
    const res = await client.post(`/api/admin/ecommerce/grants/${grant.id}/revoke`).loginAs(manager)

    res.assertStatus(403)
  })

  test('no response ever carries a storage path', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    const asset = await seedAsset(variant.id)
    const { orderId, token } = await buyAndPay(variant.id)

    const bodies = [
      (await client.get(`/api/shop/order?token=${encodeURIComponent(token)}`)).body(),
      (
        await client
          .get(`/api/admin/ecommerce/orders/${orderId}/grants`)
          .loginAs(await superadmin())
      ).body(),
      (
        await client
          .get(`/api/admin/ecommerce/products/${variant.productId}/assets`)
          .loginAs(await superadmin())
      ).body(),
    ]

    /**
     * The path is not a secret in the sense a key is — but publishing it turns
     * a misconfigured static root from "harmless" into "the whole catalogue is
     * free", so it stays server-side.
     */
    for (const body of bodies) {
      const serialised = JSON.stringify(body)
      assert.notInclude(serialised, asset.storagePath)
      assert.notInclude(serialised, 'storagePath')
      assert.notInclude(serialised, 'storage_path')
    }
  })

  test('the buyer sees a download link only after paying', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const started = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    const before = await client.get(
      `/api/shop/order?token=${encodeURIComponent(started.accessToken)}`
    )
    assert.isEmpty(before.body().downloads)

    const payment = await db
      .from('ecommerce_payments')
      .where('order_id', started.orderId)
      .firstOrFail()
    await new OrderService().markOrderPaid(started.orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: started.total.amount,
      currency: 'USD',
      source: 'webhook',
    })

    const after = await client.get(
      `/api/shop/order?token=${encodeURIComponent(started.accessToken)}`
    )
    assert.lengthOf(after.body().downloads, 1)
    assert.isString(after.body().downloads[0].url)
  })
})

test.group('E-commerce | manual orders', (group) => {
  group.each.setup(async () => resetDatabase())

  test('prices from the catalogue, not from the request', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    const result = await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 2 }],
        email: 'phone@example.com',
      },
      { type: 'system' }
    )

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.subtotalAmount, 20_000)
    assert.equal(order.status, 'pending')
    assert.equal(order.paymentStatus, 'unpaid')
  })

  test('honours an operator-set shipping charge and discount', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    const result = await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 1 }],
        email: 'phone@example.com',
        shippingAmount: 1_500,
        discountAmount: 2_000,
      },
      { type: 'system' }
    )

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.subtotalAmount, 10_000)
    assert.equal(order.discountAmount, 2_000)
    assert.equal(order.shippingAmount, 1_500)
    assert.equal(order.totalAmount, 9_500)
  })

  test('refuses a discount larger than the items', async ({ assert }) => {
    const { variant } = await seedProduct(1_000, 5)

    await assert.rejects(
      () =>
        new ManualOrderService().create(
          {
            lines: [{ variantId: variant.id, quantity: 1 }],
            email: 'phone@example.com',
            discountAmount: 5_000,
          },
          { type: 'system' }
        ),
      /larger than the items/i
    )
  })

  test('reserves stock like any other order', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 3 }],
        email: 'phone@example.com',
      },
      { type: 'system' }
    )

    await variant.refresh()
    assert.equal(variant.stockReserved, 3)
    assert.equal(variant.stockOnHand, 5)
  })

  test('cannot oversell', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 2)

    await assert.rejects(() =>
      new ManualOrderService().create(
        {
          lines: [{ variantId: variant.id, quantity: 3 }],
          email: 'phone@example.com',
        },
        { type: 'system' }
      )
    )
  })

  test('marking it paid goes through markOrderPaid and commits the stock', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    const result = await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 2 }],
        email: 'phone@example.com',
        markPaid: true,
        paymentReference: 'cash in hand',
      },
      { type: 'system' }
    )

    assert.isTrue(result.paid)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.paymentStatus, 'paid')
    assert.equal(order.status, 'confirmed')

    await variant.refresh()
    // Committed, not merely reserved: the units have left the building.
    assert.equal(variant.stockOnHand, 3)
    assert.equal(variant.stockReserved, 0)
  })

  test('a paid manual order releases its downloads', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const result = await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 1 }],
        email: 'phone@example.com',
        markPaid: true,
      },
      { type: 'system' }
    )

    assert.lengthOf(await DownloadGrant.query().where('order_id', result.orderId), 1)
  })

  test('a manual payment can be refunded without touching a gateway', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    const result = await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 1 }],
        email: 'phone@example.com',
        markPaid: true,
      },
      { type: 'system' }
    )

    /**
     * There is no driver for `manual`, so if this reached the registry it would
     * throw. That it succeeds is the assertion.
     */
    const refund = await new RefundService().refund(
      { orderId: result.orderId, amount: 10_000 },
      { type: 'system' }
    )

    assert.equal(refund.amount, 10_000)
    assert.match(String(refund.gatewayRefundId), /^manual_/)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.paymentStatus, 'refunded')
  })

  test('the endpoint needs orders:manage', async ({ client }) => {
    const { variant } = await seedProduct(10_000, 5)
    const reader = await userWith(['ecommerce:orders:read'])

    const res = await client
      .post('/api/admin/ecommerce/orders')
      .loginAs(reader)
      .json({ lines: [{ variantId: variant.id, quantity: 1 }], email: 'phone@example.com' })

    res.assertStatus(403)
  })

  test('returns the access token exactly once', async ({ client, assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    const created = await client
      .post('/api/admin/ecommerce/orders')
      .loginAs(await superadmin())
      .json({ lines: [{ variantId: variant.id, quantity: 1 }], email: 'phone@example.com' })

    created.assertStatus(201)
    const token = created.body().accessToken
    assert.isString(token)

    /**
     * Only the hash is stored, so the token cannot appear again — which is why
     * the admin shows it on a dedicated screen instead of redirecting.
     */
    const fetched = await client
      .get(`/api/admin/ecommerce/orders/${created.body().orderId}`)
      .loginAs(await superadmin())

    assert.notInclude(JSON.stringify(fetched.body()), token)

    // It does work, though.
    const status = await client.get(`/api/shop/order?token=${encodeURIComponent(token)}`)
    status.assertStatus(200)
    assert.equal(status.body().number, created.body().orderNumber)
  })
})

test.group('E-commerce | exports', (group) => {
  group.each.setup(async () => resetDatabase())

  test('escapes a field that would otherwise be read as a formula', async ({ assert }) => {
    /**
     * The attack: a customer names themselves `=HYPERLINK(...)`, finance opens
     * the CSV, and the spreadsheet executes it. Prefixing a quote is the
     * accepted defence.
     */
    assert.equal(
      csvCell('=HYPERLINK("http://evil","refund")'),
      `"'=HYPERLINK(""http://evil"",""refund"")"`
    )
    assert.equal(csvCell('+1'), "'+1")
    assert.equal(csvCell('-2'), "'-2")
    assert.equal(csvCell('@x'), "'@x")
    // An ordinary value is left completely alone.
    assert.equal(csvCell('Jane Smith'), 'Jane Smith')
    // Commas and newlines are quoted rather than allowed to break the row.
    assert.equal(csvCell('a,b'), '"a,b"')
    assert.equal(csvCell('a\nb'), '"a\nb"')
  })

  test('exports orders as integer minor units', async ({ assert }) => {
    const { variant } = await seedProduct(1_999, 5)
    await buyAndPay(variant.id)

    const csv = await new ExportService().orders()
    const lines = csv.trim().split('\r\n')

    assert.include(lines[0], 'total_minor')
    assert.include(lines[0], 'total_major')
    // The integer a spreadsheet can sum, and the decimal an accountant reads —
    // both derived from the same number, so they cannot disagree.
    assert.include(lines[1], '1999')
    assert.include(lines[1], '19.99')
  })

  test('a customer export carries no password or session material', async ({ assert }) => {
    await Customer.create({
      id: newUlid(),
      email: 'buyer@example.com',
      firstName: 'Jane',
      passwordHash: 'scrypt$should$never$appear',
      status: 'active',
      acceptsMarketing: true,
      ordersCount: 0,
      totalSpentAmount: 0,
    })

    const csv = await new ExportService().customers()

    assert.include(csv, 'buyer@example.com')
    assert.notInclude(csv, 'scrypt')
    assert.notInclude(csv, 'password')
    assert.notInclude(csv, 'token')
  })

  test('the orders export is refused to someone who cannot read orders', async ({ client }) => {
    const outsider = await userWith(['ecommerce:products:read'])
    const res = await client.get('/api/admin/ecommerce/exports/orders').loginAs(outsider)
    res.assertStatus(403)
  })

  test('the customers export is refused to someone who cannot read customers', async ({
    client,
  }) => {
    const outsider = await userWith(['ecommerce:orders:read'])
    const res = await client.get('/api/admin/ecommerce/exports/customers').loginAs(outsider)
    res.assertStatus(403)
  })

  test('exports are downloaded, not rendered', async ({ client, assert }) => {
    const res = await client.get('/api/admin/ecommerce/exports/orders').loginAs(await superadmin())

    res.assertStatus(200)
    assert.include(String(res.header('content-type')), 'text/csv')
    assert.include(String(res.header('content-disposition')), 'attachment')
    assert.equal(res.header('x-content-type-options'), 'nosniff')
  })

  test('every export is audited', async ({ client, assert }) => {
    await client.get('/api/admin/ecommerce/exports/orders').loginAs(await superadmin())

    const entry = await db
      .from('audit_logs')
      .where('action', 'ecommerce.exported')
      .orderBy('created_at', 'desc')
      .first()

    /**
     * "Who pulled the customer list, and when" cannot be answered after the
     * fact unless it was recorded at the time.
     */
    assert.isNotNull(entry)
    assert.equal(entry.subject_id, 'orders')
  })

  test('a date range narrows what comes out', async ({ assert }) => {
    const { variant } = await seedProduct(1_000, 10)
    await buyAndPay(variant.id)

    const future = DateTime.now().plus({ days: 2 }).toISODate()!
    const csv = await new ExportService().orders({ from: future })

    // Header only.
    assert.lengthOf(csv.trim().split('\r\n'), 1)
  })

  test('refuses a date it cannot read rather than exporting everything', async ({ assert }) => {
    await assert.rejects(
      () => new ExportService().orders({ from: 'last tuesday' }),
      /date could not be read/i
    )
  })
})

test.group('E-commerce | customers admin', (group) => {
  group.each.setup(async () => resetDatabase())

  test('lists buyers without leaking their password hash', async ({ client, assert }) => {
    await Customer.create({
      id: newUlid(),
      email: 'buyer@example.com',
      passwordHash: 'scrypt$secret',
      status: 'active',
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })

    const res = await client.get('/api/admin/ecommerce/customers').loginAs(await superadmin())

    res.assertStatus(200)
    assert.lengthOf(res.body().items, 1)
    assert.notInclude(JSON.stringify(res.body()), 'scrypt')
    assert.notInclude(JSON.stringify(res.body()), 'passwordHash')
  })

  test('blocking a customer ends their sessions', async ({ client, assert }) => {
    const customer = await Customer.create({
      id: newUlid(),
      email: 'buyer@example.com',
      passwordHash: 'scrypt$secret',
      status: 'active',
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })

    await db.table('ecommerce_customer_sessions').insert({
      id: newUlid(),
      customer_id: customer.id,
      token_hash: 'a'.repeat(64),
      expires_at: DateTime.now().plus({ days: 7 }).toSQL(),
      created_at: DateTime.now().toSQL(),
    })

    const res = await client
      .put(`/api/admin/ecommerce/customers/${customer.id}/status`)
      .loginAs(await superadmin())
      .json({ status: 'blocked' })

    res.assertStatus(200)

    /**
     * A status flag that leaves live sessions working blocks nobody who is
     * already signed in — which is exactly the person being blocked.
     */
    const session = await db
      .from('ecommerce_customer_sessions')
      .where('customer_id', customer.id)
      .first()
    assert.isNotNull(session.revoked_at)
  })

  test('reading customers does not permit blocking them', async ({ client, assert }) => {
    const customer = await Customer.create({
      id: newUlid(),
      email: 'buyer@example.com',
      status: 'active',
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })

    const reader = await userWith(['ecommerce:customers:read'])
    const res = await client
      .put(`/api/admin/ecommerce/customers/${customer.id}/status`)
      .loginAs(reader)
      .json({ status: 'blocked' })

    res.assertStatus(403)

    await customer.refresh()
    assert.equal(customer.status, 'active')
  })
})

test.group('E-commerce | order confirmation', (group) => {
  group.each.setup(async () => resetDatabase())

  test('carries a link that actually opens the order', async ({ client, assert }) => {
    const { variant } = await seedProduct(1_999, 5)
    const { orderId } = await buyAndPay(variant.id)

    const context = await new OrderNotifierService().buildConfirmation(orderId)

    assert.isNotNull(context)
    assert.isString(context!.orderUrl)

    /**
     * The whole point of `access_token_enc`: the webhook that marked this paid
     * never saw the plaintext, so a link in the email proves the encrypted copy
     * round-trips. Pulling the token back out and using it is the only honest
     * way to assert that.
     */
    const token = new URL(context!.orderUrl!).searchParams.get('token')!
    const res = await client.get(`/api/shop/order?token=${encodeURIComponent(token)}`)

    res.assertStatus(200)
    assert.isTrue(res.body().paid)
    assert.equal(res.body().number, context!.number)
  })

  test('lists what was bought, with amounts already formatted', async ({ assert }) => {
    const { variant } = await seedProduct(1_999, 5)
    const { orderId } = await buyAndPay(variant.id)

    const context = await new OrderNotifierService().buildConfirmation(orderId)

    assert.lengthOf(context!.items, 1)
    assert.equal(context!.items[0].quantity, 1)
    // Pre-formatted: an email template must never do money arithmetic.
    assert.include(context!.subtotal, '19.99')
    assert.include(context!.total, '19.99')
  })

  test('omits the rows that would read as zero', async ({ assert }) => {
    const { variant } = await seedProduct(1_999, 5)
    const { orderId } = await buyAndPay(variant.id)

    const context = await new OrderNotifierService().buildConfirmation(orderId)

    // Null rather than "$0.00", so the template drops the row entirely.
    assert.isNull(context!.discount)
    assert.isNull(context!.shipping)
  })

  test('includes working download links for a digital order', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id, { contents: 'chapter one' })
    const { orderId } = await buyAndPay(variant.id)

    const context = await new OrderNotifierService().buildConfirmation(orderId)

    assert.lengthOf(context!.downloads, 1)
    assert.equal(context!.downloads[0].filename, 'manual.txt')

    // Follow the link the buyer would click.
    const url = new URL(context!.downloads[0].url)
    const res = await client.get(`${url.pathname}${url.search}`)

    res.assertStatus(200)
    assert.equal(res.text(), 'chapter one')
  })

  test('carries no downloads for a physical order', async ({ assert }) => {
    const { variant } = await seedProduct(1_999, 5, 'physical')
    const { orderId } = await buyAndPay(variant.id)

    const context = await new OrderNotifierService().buildConfirmation(orderId)
    assert.isEmpty(context!.downloads)
  })

  test('a revoked download is left out of the email', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)
    const { orderId } = await buyAndPay(variant.id)

    const grant = await DownloadGrant.query().where('order_id', orderId).firstOrFail()
    grant.revokedAt = DateTime.now()
    await grant.save()

    const context = await new OrderNotifierService().buildConfirmation(orderId)
    assert.isEmpty(context!.downloads)
  })

  test('the access token never leaves through an ordinary endpoint', async ({ client, assert }) => {
    const { variant } = await seedProduct(1_999, 5)
    const { orderId } = await buyAndPay(variant.id)

    const context = await new OrderNotifierService().buildConfirmation(orderId)
    const token = new URL(context!.orderUrl!).searchParams.get('token')!

    /**
     * The encrypted copy exists for the mail builder and nothing else. If it
     * ever reaches an API response, the column has become a liability instead
     * of a convenience.
     */
    const admin = await client
      .get(`/api/admin/ecommerce/orders/${orderId}`)
      .loginAs(await superadmin())
    const buyer = await client.get(`/api/shop/order?token=${encodeURIComponent(token)}`)

    for (const body of [admin.body(), buyer.body()]) {
      const serialised = JSON.stringify(body)
      assert.notInclude(serialised, token)
      assert.notInclude(serialised, 'accessTokenEnc')
      assert.notInclude(serialised, 'access_token_enc')
      assert.notInclude(serialised, 'accessTokenHash')
    }
  })

  test('a failing mailer never unpays an order', async ({ assert }) => {
    const { variant } = await seedProduct(1_999, 5)

    /**
     * Rule 5, exercised directly. `sendOrderConfirmation` swallows everything —
     * so point it at an order that does not exist and confirm it reports
     * failure rather than raising into the payment path that calls it.
     */
    const notifier = new OrderNotifierService()
    assert.isFalse(await notifier.sendOrderConfirmation('does-not-exist'))
    assert.isNull(await notifier.buildConfirmation('does-not-exist'))

    // And the ordinary path still settles.
    const { orderId } = await buyAndPay(variant.id)
    const order = await Order.findOrFail(orderId)
    assert.equal(order.paymentStatus, 'paid')
  })

  test('one order sends one receipt however many webhooks arrive', async ({ assert }) => {
    const { variant } = await seedProduct(1_999, 5)
    const { orderId } = await buyAndPay(variant.id)

    const payment = await db.from('ecommerce_payments').where('order_id', orderId).firstOrFail()
    const again = await new OrderService().markOrderPaid(orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: 1_999,
      currency: 'USD',
      source: 'webhook',
    })

    /**
     * The receipt sits after the `changed` guard, so a duplicate delivery
     * returns early and never reaches it. Asserting `changed` is asserting the
     * email did not go out twice.
     */
    assert.isFalse(again.changed)
  })
})

test.group('E-commerce | free checkout', (group) => {
  group.each.setup(async () => resetDatabase())

  async function freeCheckout(variantId: string, code = 'ALLFREE') {
    return new CheckoutService().start({
      lines: [{ variantId, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      discountCode: code,
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })
  }

  test('a 100% discount settles the order without a gateway', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)
    await new DiscountService().create({ code: 'ALLFREE', type: 'percent', value: 100 })

    const result = await freeCheckout(variant.id)

    assert.isTrue(result.paid)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.totalAmount, 0)
    assert.equal(order.paymentStatus, 'paid')
    assert.equal(order.status, 'confirmed')

    /**
     * The gateway was never asked for a session, so the fake driver holds no
     * record of one — a free order must not reach a driver that would reject a
     * zero charge.
     */
    assert.lengthOf(await db.from('ecommerce_payments').where('order_id', order.id), 0)
  })

  test('the redirect goes to the order page, not a gateway', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)
    await new DiscountService().create({ code: 'ALLFREE', type: 'percent', value: 100 })

    const result = await freeCheckout(variant.id)

    assert.include(result.redirectUrl, 'https://shop.test/thanks')
    assert.include(result.redirectUrl, 'token=')
    assert.notInclude(result.redirectUrl, 'gateway.test')
  })

  test('stock is committed, not just reserved', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)
    await new DiscountService().create({ code: 'ALLFREE', type: 'percent', value: 100 })

    await freeCheckout(variant.id)

    await variant.refresh()
    // Going through `markOrderPaid` is what buys this. A free order that only
    // reserved would have its stock released by the expiry sweep.
    assert.equal(variant.stockOnHand, 4)
    assert.equal(variant.stockReserved, 0)
  })

  test('digital goods are released immediately', async ({ client, assert }) => {
    const { variant } = await seedProduct(5_000, 5, 'digital')
    await seedAsset(variant.id, { contents: 'free sample' })
    await new DiscountService().create({ code: 'ALLFREE', type: 'percent', value: 100 })

    const result = await freeCheckout(variant.id)

    const grant = await DownloadGrant.query().where('order_id', result.orderId).firstOrFail()
    const res = await client.get(
      `/shop/download/${grant.id}?token=${encodeURIComponent(result.accessToken)}`
    )

    res.assertStatus(200)
    assert.equal(res.text(), 'free sample')
  })

  test('the quota on a free code is still spent exactly once', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 10)
    await new DiscountService().create({
      code: 'ALLFREE',
      type: 'percent',
      value: 100,
      usageLimit: 1,
    })

    await freeCheckout(variant.id)

    /**
     * The whole risk of free checkout: a code that costs the store its entire
     * margin must be consumed by the same atomic claim as any other, or one
     * leaked coupon empties the warehouse.
     */
    await assert.rejects(() => freeCheckout(variant.id))

    const discount = await Discount.findByOrFail('code', 'ALLFREE')
    assert.equal(discount.usageCount, 1)
  })

  test('a client cannot declare its own basket free', async ({ client, assert }) => {
    const { variant } = await seedProduct(5_000, 5)

    await client.post('/api/shop/cart/items').json({ variantId: variant.id, quantity: 1 })

    /**
     * There is no amount field to tamper with, and an unknown code is refused
     * rather than ignored — so the only route to zero is a discount the store
     * actually created.
     */
    const res = await client
      .post('/api/shop/checkout')
      .header('idempotency-key', `k-${newUlid()}`)
      .json({
        email: 'buyer@example.com',
        gateway: 'stripe',
        discountCode: 'ALLFREE',
        total: 0,
        totalAmount: 0,
      })

    assert.equal(res.status(), 422)
    assert.lengthOf(await Order.all(), 0)
  })

  test('a comped manual order settles itself without being marked paid', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)

    const result = await new ManualOrderService().create(
      {
        lines: [{ variantId: variant.id, quantity: 1 }],
        email: 'comped@example.com',
        discountAmount: 5_000,
        // Deliberately absent: a free order settles whatever this says, because
        // waiting for a payment that can never arrive would let the expiry
        // sweep take the stock back.
      },
      { type: 'system' }
    )

    assert.isTrue(result.paid)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.totalAmount, 0)
    assert.equal(order.paymentStatus, 'paid')

    // No money moved, so no payment row claims otherwise.
    assert.lengthOf(await db.from('ecommerce_payments').where('order_id', order.id), 0)

    await variant.refresh()
    assert.equal(variant.stockOnHand, 4)
    assert.equal(variant.stockReserved, 0)
  })

  test('a paid order is never reported as settled at checkout', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)

    const result = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    // Rule 2: only a webhook or a server-side pull may settle a real payment.
    assert.isFalse(result.paid)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.paymentStatus, 'unpaid')
  })
})

test.group('E-commerce | maintenance sweeps', (group) => {
  group.each.setup(async () => resetDatabase())

  test('releases stock held by an abandoned checkout', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)

    const started = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 2 }],
      email: 'ghost@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    await variant.refresh()
    assert.equal(variant.stockReserved, 2, 'reserved while the buyer decides')

    // Wind the window back so the order is past its expiry.
    const order = await Order.findOrFail(started.orderId)
    order.reservationExpiresAt = DateTime.now().minus({ hours: 1 })
    await order.save()

    const summary = await new MaintenanceService().runAll()

    assert.equal(summary.ordersExpired, 1)

    await variant.refresh()
    /**
     * The whole point of the sweep. Without it the oversell guard becomes a
     * permanent inventory lock: every abandoned basket takes stock with it and
     * never gives it back.
     */
    assert.equal(variant.stockReserved, 0)
    assert.equal(variant.stockOnHand, 5)

    await order.refresh()
    assert.equal(order.status, 'cancelled')
  })

  test('hands back the discount an abandoned checkout consumed', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)
    await new DiscountService().create({
      code: 'LIMITED',
      type: 'percent',
      value: 10,
      usageLimit: 1,
    })

    const started = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'ghost@example.com',
      gateway: 'stripe',
      discountCode: 'LIMITED',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    assert.equal((await Discount.findByOrFail('code', 'LIMITED')).usageCount, 1)

    const order = await Order.findOrFail(started.orderId)
    order.reservationExpiresAt = DateTime.now().minus({ hours: 1 })
    await order.save()

    await new MaintenanceService().runAll()

    /**
     * Otherwise anyone could burn a limited promotion to zero by starting
     * checkouts and walking away.
     */
    assert.equal((await Discount.findByOrFail('code', 'LIMITED')).usageCount, 0)
  })

  test('never expires an order that was paid', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)
    const { orderId } = await buyAndPay(variant.id)

    /**
     * `markOrderPaid` clears `reservation_expires_at`, and the sweep is guarded
     * on `payment_status = 'unpaid'` besides — but a paid order being cancelled
     * by a sweep is the single worst thing this could do, so it gets its own
     * test.
     */
    const order = await Order.findOrFail(orderId)
    order.reservationExpiresAt = DateTime.now().minus({ hours: 1 })
    await order.save()

    const summary = await new MaintenanceService().runAll()

    assert.equal(summary.ordersExpired, 0)
    await order.refresh()
    assert.equal(order.status, 'confirmed')
    assert.equal(order.paymentStatus, 'paid')
  })

  test('matures a commission once the refund window has passed', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    await new AffiliateService().create({
      code: 'PARTNER',
      name: 'A Partner',
      email: 'partner@example.com',
      commissionPercent: 10,
    })

    const started = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      affiliateCode: 'PARTNER',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    const payment = await db
      .from('ecommerce_payments')
      .where('order_id', started.orderId)
      .firstOrFail()
    await new OrderService().markOrderPaid(started.orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: started.total.amount,
      currency: 'USD',
      source: 'webhook',
    })

    const commission = await Commission.query().where('order_id', started.orderId).firstOrFail()
    assert.equal(commission.status, 'pending')

    // Age it past the refund window.
    await db
      .from('ecommerce_commissions')
      .where('id', commission.id)
      .update({ created_at: DateTime.now().minus({ days: 90 }).toSQL() })

    const summary = await new MaintenanceService().runAll()

    assert.equal(summary.commissionsApproved, 1)
    await commission.refresh()
    /**
     * Without the sweep every commission stays `pending` forever and no
     * affiliate is ever paid — the payout screen would simply always be empty.
     */
    assert.equal(commission.status, 'approved')
  })

  test('leaves a fresh commission alone', async ({ assert }) => {
    const { variant } = await seedProduct(10_000, 5)

    await new AffiliateService().create({
      code: 'PARTNER',
      name: 'A Partner',
      email: 'partner@example.com',
      commissionPercent: 10,
    })

    const started = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      affiliateCode: 'PARTNER',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    const payment = await db
      .from('ecommerce_payments')
      .where('order_id', started.orderId)
      .firstOrFail()
    await new OrderService().markOrderPaid(started.orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: started.total.amount,
      currency: 'USD',
      source: 'webhook',
    })

    const summary = await new MaintenanceService().runAll()

    // Still inside the refund window, so it must not be payable yet.
    assert.equal(summary.commissionsApproved, 0)
  })

  test('running twice does nothing the second time', async ({ assert }) => {
    const { variant } = await seedProduct(5_000, 5)

    const started = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'ghost@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    const order = await Order.findOrFail(started.orderId)
    order.reservationExpiresAt = DateTime.now().minus({ hours: 1 })
    await order.save()

    const first = await new MaintenanceService().runAll()
    const second = await new MaintenanceService().runAll()

    /**
     * Cron runs overlap, and a second pass while the first is still going is
     * normal. Every sweep is a conditional UPDATE, so the second finds nothing
     * to claim rather than releasing the same stock twice.
     */
    assert.equal(first.ordersExpired, 1)
    assert.equal(second.ordersExpired, 0)

    await variant.refresh()
    assert.equal(variant.stockOnHand, 5, 'stock was returned once, not twice')
    assert.equal(variant.stockReserved, 0)
  })

  test('a summary of zeroes on a quiet store, not an error', async ({ assert }) => {
    const summary = await new MaintenanceService().runAll()

    assert.equal(summary.ordersExpired, 0)
    assert.equal(summary.commissionsApproved, 0)
    assert.equal(summary.webhooksProcessed, 0)
    assert.equal(summary.clicksPruned, 0)
  })
})

test.group('E-commerce | analytics', (group) => {
  group.each.setup(async () => resetDatabase())

  test('reports revenue on the day it was paid', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 10)
    await buyAndPay(variant.id)
    await buyAndPay(variant.id)

    const report = await new AnalyticsService().sales(30)

    assert.lengthOf(report.series, 30)
    assert.equal(report.windowOrders, 2)
    assert.equal(report.windowRevenue.amount, 5_000)

    const today = report.series[report.series.length - 1]
    assert.equal(today.orders, 2)
    assert.equal(today.revenue, 5_000)
  })

  test('includes days with no sales rather than skipping them', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 10)
    await buyAndPay(variant.id)

    const report = await new AnalyticsService().sales(7)

    /**
     * A series with gaps makes a chart draw a straight line across a quiet
     * week, which reads as steady trade rather than none.
     */
    assert.lengthOf(report.series, 7)
    assert.equal(report.series.filter((p) => p.orders === 0).length, 6)
  })

  test('a refunded sale contributes nothing to revenue', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 10)
    const kept = await buyAndPay(variant.id)
    const returned = await buyAndPay(variant.id)

    await new RefundService().refund(
      { orderId: returned.orderId, amount: 2_500 },
      { type: 'system' }
    )

    const report = await new AnalyticsService().sales(30)

    /**
     * A dashboard that counts refunded sales as revenue lies in exactly the
     * situation where the truth matters.
     */
    assert.equal(report.windowRevenue.amount, 2_500)
    assert.isNotNull(kept.orderId)
  })

  test('an unpaid order is not revenue', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 10)

    await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'browsing@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    const report = await new AnalyticsService().sales(30)
    assert.equal(report.windowOrders, 0)
    assert.equal(report.windowRevenue.amount, 0)
  })

  test('ranks the best sellers by units', async ({ assert }) => {
    const popular = await seedProduct(1_000, 50)
    const rare = await seedProduct(9_000, 50)

    for (let i = 0; i < 3; i++) await buyAndPay(popular.variant.id)
    await buyAndPay(rare.variant.id)

    const report = await new AnalyticsService().sales(30)

    assert.isAtLeast(report.topProducts.length, 2)
    assert.equal(report.topProducts[0].quantity, 3)
    assert.equal(report.topProducts[0].productId, popular.product.id)
    assert.equal(report.topProducts[0].revenue.amount, 3_000)
  })

  test('still reports a sale whose product was deleted', async ({ assert }) => {
    const { product, variant } = await seedProduct(2_500, 10)
    await buyAndPay(variant.id)

    product.deletedAt = DateTime.now()
    await product.save()

    const report = await new AnalyticsService().sales(30)

    /**
     * Grouped on the order line's snapshot title, not joined to the catalogue.
     * The sale happened; a report that quietly drops it is wrong about the past.
     */
    assert.lengthOf(report.topProducts, 1)
    assert.equal(report.topProducts[0].quantity, 1)
  })

  test('a quiet store reports zeroes, not an error', async ({ assert }) => {
    const report = await new AnalyticsService().sales(30)

    assert.lengthOf(report.series, 30)
    assert.equal(report.windowRevenue.amount, 0)
    assert.isEmpty(report.topProducts)
  })

  test('lists a basket that was filled and left', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 10)

    await client.post('/api/shop/cart/items').json({ variantId: variant.id, quantity: 2 })

    // Nothing is abandoned until the checkout window has passed.
    assert.isEmpty(await new AnalyticsService().abandonedCarts())

    await db
      .from('ecommerce_carts')
      .update({ updated_at: DateTime.now().minus({ days: 2 }).toSQL() })

    const carts = await new AnalyticsService().abandonedCarts()

    assert.lengthOf(carts, 1)
    assert.equal(carts[0].itemCount, 2)
    // Priced from the variant's current price — carts hold no price of their own.
    assert.equal(carts[0].value.amount, 5_000)
    assert.isFalse(carts[0].reachable, 'a guest basket has no email to reach')
  })

  test('a basket that became an order is not abandoned', async ({ client, assert }) => {
    const { variant } = await seedProduct(2_500, 10)

    const added = await client
      .post('/api/shop/cart/items')
      .json({ variantId: variant.id, quantity: 1 })
    const cookie = added.cookie('dl_cart')?.value ?? ''

    await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cookie)
      .header('idempotency-key', `k-${newUlid()}`)
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    await db
      .from('ecommerce_carts')
      .update({ updated_at: DateTime.now().minus({ days: 2 }).toSQL() })

    /**
     * Checkout empties the basket, so the join to cart items finds nothing —
     * a completed purchase must never show up as a lost one.
     */
    assert.isEmpty(await new AnalyticsService().abandonedCarts())
  })

  test('the dashboard endpoints need dashboard:read', async ({ client }) => {
    const outsider = await userWith(['ecommerce:products:read'])

    ;(await client.get('/api/admin/ecommerce/sales').loginAs(outsider)).assertStatus(403)
    ;(await client.get('/api/admin/ecommerce/abandoned-carts').loginAs(outsider)).assertStatus(403)
  })

  test('serves both endpoints to an admin', async ({ client, assert }) => {
    const sales = await client.get('/api/admin/ecommerce/sales').loginAs(await superadmin())
    const carts = await client
      .get('/api/admin/ecommerce/abandoned-carts')
      .loginAs(await superadmin())

    sales.assertStatus(200)
    carts.assertStatus(200)
    assert.lengthOf(sales.body().series, 30)
  })
})

test.group('E-commerce | order stage', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a downloads-only order fulfils itself when it is paid', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)

    const { orderId } = await buyAndPay(variant.id)

    const order = await Order.findOrFail(orderId)
    assert.equal(order.fulfillmentStatus, 'fulfilled')
    assert.equal(order.status, 'fulfilled')
    /**
     * The point of the whole thing: nobody has to post a download, so it must
     * not be sitting in the operator's work queue.
     */
    assert.equal(stageOf(order), 'open')
    // And it is dated, so the refund-window sweep can eventually close it.
    assert.isNotNull(order.fulfilledAt)
  })

  test('a digital order eventually closes itself', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'digital')
    await seedAsset(variant.id)
    const { orderId } = await buyAndPay(variant.id)

    /**
     * Nothing is touched here but the clock — the order is left exactly as
     * payment produced it. That is the point: a download sale must reach
     * `completed` on its own, with no operator ever opening it.
     */
    await db
      .from('ecommerce_orders')
      .where('id', orderId)
      .update({ fulfilled_at: DateTime.now().minus({ days: 60 }).toSQL() })

    assert.equal(await new OrderService().completeMatured(), 1)
    assert.equal((await Order.findOrFail(orderId)).status, 'completed')
  })

  test('a physical order still waits to be sent', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'physical')

    const { orderId } = await buyAndPay(variant.id)

    const order = await Order.findOrFail(orderId)
    assert.equal(order.fulfillmentStatus, 'unfulfilled')
    assert.equal(stageOf(order), 'action')
  })

  test('a mixed order waits — the physical half still has to go out', async ({ assert }) => {
    const digital = await seedProduct(2_500, 5, 'digital')
    await seedAsset(digital.variant.id)
    const physical = await seedProduct(4_000, 5, 'physical')

    const result = await new CheckoutService().start({
      lines: [
        { variantId: digital.variant.id, quantity: 1 },
        { variantId: physical.variant.id, quantity: 1 },
      ],
      email: 'buyer@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })
    const payment = await db
      .from('ecommerce_payments')
      .where('order_id', result.orderId)
      .firstOrFail()
    await new OrderService().markOrderPaid(result.orderId, {
      gatewayPaymentId: String(payment.gateway_payment_id),
      amount: result.total.amount,
      currency: result.total.currency,
      source: 'webhook',
    })

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.fulfillmentStatus, 'unfulfilled')
    assert.equal(stageOf(order), 'action')
  })

  test('an unpaid order is open, not work', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'physical')
    const result = await new CheckoutService().start({
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe',
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
    })

    assert.equal(stageOf(await Order.findOrFail(result.orderId)), 'open')
  })

  test('a refunded order is closed even though it was never sent', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'physical')
    const { orderId } = await buyAndPay(variant.id)

    await db
      .from('ecommerce_orders')
      .where('id', orderId)
      .update({ payment_status: 'refunded' })

    /**
     * Guards the ordering inside `stageOf`. Checking "paid and unsent" first
     * would leave this order in the work queue permanently, asking to be posted
     * long after the money went back.
     */
    assert.equal(stageOf(await Order.findOrFail(orderId)), 'closed')
  })

  /**
   * The stage filter is hand-written SQL that mirrors `stageOf`. Two
   * implementations of one rule can drift, so this asserts they agree across a
   * spread of orders rather than trusting that they were written to match.
   */
  test('the SQL filter agrees with stageOf on every order', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 50, 'physical')

    const rows: Record<string, string>[] = [
      { payment_status: 'unpaid', status: 'pending', fulfillment_status: 'unfulfilled' },
      { payment_status: 'paid', status: 'confirmed', fulfillment_status: 'unfulfilled' },
      { payment_status: 'paid', status: 'confirmed', fulfillment_status: 'partially_fulfilled' },
      { payment_status: 'paid', status: 'fulfilled', fulfillment_status: 'fulfilled' },
      { payment_status: 'paid', status: 'completed', fulfillment_status: 'fulfilled' },
      { payment_status: 'refunded', status: 'confirmed', fulfillment_status: 'unfulfilled' },
      { payment_status: 'failed', status: 'pending', fulfillment_status: 'unfulfilled' },
      { payment_status: 'paid', status: 'cancelled', fulfillment_status: 'unfulfilled' },
      {
        payment_status: 'partially_refunded',
        status: 'confirmed',
        fulfillment_status: 'unfulfilled',
      },
      { payment_status: 'unpaid', status: 'cancelled', fulfillment_status: 'unfulfilled' },
    ]

    for (const row of rows) {
      const { orderId } = await buyAndPay(variant.id)
      await db.from('ecommerce_orders').where('id', orderId).update(row)
    }

    const all = await Order.all()
    const query = new OrderQueryService()

    for (const stage of ['action', 'open', 'closed'] as const) {
      const listed = await query.list({ stage, pageSize: 100 })
      const expected = all.filter((o) => stageOf(o) === stage).map((o) => o.id)

      assert.sameMembers(
        listed.items.map((i) => i.id),
        expected,
        `SQL and stageOf disagree on "${stage}"`
      )
      // The DTO carries the same verdict, so the row badge cannot contradict the tab.
      assert.isTrue(listed.items.every((i) => i.stage === stage))
    }

    // And the three buckets partition the set — nothing lost, nothing counted twice.
    assert.equal(
      (await query.list({ stage: 'action', pageSize: 100 })).total +
        (await query.list({ stage: 'open', pageSize: 100 })).total +
        (await query.list({ stage: 'closed', pageSize: 100 })).total,
      (await query.list({ pageSize: 100 })).total
    )
  })

  test('completeMatured closes delivered orders past the refund window', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 10, 'physical')
    const { orderId } = await buyAndPay(variant.id)

    await db
      .from('ecommerce_orders')
      .where('id', orderId)
      .update({
        status: 'fulfilled',
        fulfillment_status: 'fulfilled',
        fulfilled_at: DateTime.now().minus({ days: 60 }).toSQL(),
      })

    const closed = await new OrderService().completeMatured()

    assert.equal(closed, 1)
    assert.equal((await Order.findOrFail(orderId)).status, 'completed')
    // Idempotent: a second sweep finds nothing left to do.
    assert.equal(await new OrderService().completeMatured(), 0)
  })

  test('completeMatured leaves a freshly shipped order alone', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 10, 'physical')
    const { orderId } = await buyAndPay(variant.id)

    await db.from('ecommerce_orders').where('id', orderId).update({
      status: 'fulfilled',
      fulfillment_status: 'fulfilled',
      fulfilled_at: DateTime.now().toSQL(),
    })

    assert.equal(await new OrderService().completeMatured(), 0)
    assert.equal((await Order.findOrFail(orderId)).status, 'fulfilled')
  })
})


test.group('E-commerce | line item images', (group) => {
  group.each.setup(async () => resetDatabase())

  /**
   * Images are uploaded against the product, so a variant's own `image_url` is
   * null on almost every shop. Reading it alone left every cart line, order page
   * and receipt pictureless while the product page beside them showed the
   * photograph.
   */
  test('a line falls back to the product image', async ({ assert }) => {
    const { product, variant } = await seedProduct(2_500, 5, 'physical')
    await ProductImage.create({
      id: newUlid(),
      productId: product.id,
      mediaUrl: '/uploads/shirt.jpg',
      alt: null,
      position: 0,
    })

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])

    assert.equal(priced.lines[0].imageUrl, '/uploads/shirt.jpg')
  })

  test('the first image wins, by position not insertion', async ({ assert }) => {
    const { product, variant } = await seedProduct(2_500, 5, 'physical')

    // Created out of order on purpose — position decides, not creation time.
    await ProductImage.create({
      id: newUlid(),
      productId: product.id,
      mediaUrl: '/uploads/second.jpg',
      alt: null,
      position: 1,
    })
    await ProductImage.create({
      id: newUlid(),
      productId: product.id,
      mediaUrl: '/uploads/first.jpg',
      alt: null,
      position: 0,
    })

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])

    assert.equal(priced.lines[0].imageUrl, '/uploads/first.jpg')
  })

  test("a variant's own image still wins", async ({ assert }) => {
    const { product, variant } = await seedProduct(2_500, 5, 'physical')
    await ProductImage.create({
      id: newUlid(),
      productId: product.id,
      mediaUrl: '/uploads/product.jpg',
      alt: null,
      position: 0,
    })

    variant.imageUrl = '/uploads/variant-red.jpg'
    await variant.save()

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])

    // The whole point of a per-variant image: a red shirt must not show blue.
    assert.equal(priced.lines[0].imageUrl, '/uploads/variant-red.jpg')
  })

  test('a product with no images at all is simply pictureless', async ({ assert }) => {
    const { variant } = await seedProduct(2_500, 5, 'physical')

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])

    assert.isNull(priced.lines[0].imageUrl)
  })

  test('the image reaches the order snapshot', async ({ assert }) => {
    const { product, variant } = await seedProduct(2_500, 5, 'physical')
    await ProductImage.create({
      id: newUlid(),
      productId: product.id,
      mediaUrl: '/uploads/snapshot.jpg',
      alt: null,
      position: 0,
    })

    const { orderId } = await buyAndPay(variant.id)

    const item = await db.from('ecommerce_order_items').where('order_id', orderId).firstOrFail()
    assert.equal(item.image_url, '/uploads/snapshot.jpg')
  })
})
