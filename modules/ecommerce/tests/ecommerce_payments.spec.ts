import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import AuditLog from '#models/audit_log'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import WebhookEvent from '#modules/ecommerce/models/webhook_event'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import OrderService from '#modules/ecommerce/services/order_service'
import WebhookService from '#modules/ecommerce/services/webhook_service'
import RefundService from '#modules/ecommerce/services/refund_service'
import IdempotencyService, {
  actorFingerprint,
} from '#modules/ecommerce/services/idempotency_service'
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
  new ModulesService().bustCache()

  fake = new FakeGatewayDriver('stripe')
  overrideGateway('stripe', fake)

  // The store row must exist before pricing runs.
  await new StoreSettingsService().getOrCreate()

  return async () => {
    clearGatewayOverrides()
    await cleanup()
  }
}

/**
 * True concurrency needs PostgreSQL.
 *
 * `better-sqlite3` is a single synchronous connection, so two overlapping write
 * transactions do not race — they deadlock, and the suite hangs rather than
 * failing. The sequential tests below still prove the *guard* works (the
 * conditional UPDATE rejects the second attempt); what they cannot prove is
 * that it holds when both attempts are genuinely in flight.
 *
 * Run the suite against PostgreSQL to exercise those paths:
 *   NODE_ENV=development DATABASE_URL=… node ace test
 */
const CONCURRENCY_UNSUPPORTED = db.connection().dialect.name !== 'postgres'
const CONCURRENCY_REASON = 'Needs PostgreSQL — SQLite serialises writes on one connection'

/** A sellable product with one variant at £19.99 and `stock` units. */
async function seedProduct(price = 1999, stock = 10) {
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

async function startCheckout(variantId: string, quantity = 1) {
  return new CheckoutService().start({
    lines: [{ variantId, quantity }],
    email: 'buyer@example.com',
    gateway: 'stripe',
    successUrl: 'https://shop.test/thanks',
    cancelUrl: 'https://shop.test/cart',
  })
}

/**
 * POST an exact byte sequence.
 *
 * Japa's `.json()` serialises an object, which is precisely what must not
 * happen here: webhook signatures cover the bytes as sent, so the test has to
 * control them. Its `send()` is the dispatcher, so the body goes onto the
 * underlying superagent request directly.
 */
function postRaw(
  client: { post: (url: string) => any },
  url: string,
  rawBody: string,
  headers: Record<string, string> = {}
) {
  const req = client.post(url).type('json')
  for (const [key, value] of Object.entries(headers)) req.header(key, value)
  req.request.send(rawBody)
  return req
}

/** What `FakeGatewayDriver.verifyWebhook` accepts, and what it rejects. */
const SIGNED = { 'fake-signature': 'valid' }
const UNSIGNED = { 'fake-signature': 'wrong' }

/** Convenience for the common "correctly signed delivery" case. */
function postRawSigned(client: { post: (url: string) => any }, url: string, rawBody: string) {
  return postRaw(client, url, rawBody, SIGNED)
}

test.group('E-commerce | checkout', (group) => {
  group.each.setup(async () => resetDatabase())

  test('creates an unpaid order and reserves stock', async ({ assert }) => {
    const { variant } = await seedProduct(1999, 10)
    const result = await startCheckout(variant.id, 2)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.paymentStatus, 'unpaid')
    assert.equal(order.status, 'pending')
    assert.equal(order.totalAmount, 3998)
    assert.isNotNull(order.reservationExpiresAt)

    await variant.refresh()
    assert.equal(variant.stockReserved, 2, 'stock is held, not yet taken')
    assert.equal(variant.stockOnHand, 10, 'nothing has left the shelf yet')
  })

  test('prices from the database, ignoring anything a client might send', async ({ assert }) => {
    const { variant } = await seedProduct(1999, 5)

    /**
     * Price-shaped keys are smuggled in alongside the real input. The checkout
     * type has no price field, so this is what a tampered request would
     * actually look like on the wire — and the total still comes from the
     * variant row.
     */
    const tampered = {
      lines: [{ variantId: variant.id, quantity: 1 }],
      email: 'buyer@example.com',
      gateway: 'stripe' as const,
      successUrl: 'https://shop.test/thanks',
      cancelUrl: 'https://shop.test/cart',
      priceAmount: 1,
      totalAmount: 1,
      total: 1,
      unitAmount: 1,
    }

    const result = await new CheckoutService().start(tampered)

    assert.equal(result.total.amount, 1999, 'the smuggled amounts must be ignored')

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.totalAmount, 1999)
    assert.equal(order.subtotalAmount, 1999)
  })

  test('refuses to oversell the last unit', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 1)

    await startCheckout(variant.id, 1)

    await assert.rejects(() => startCheckout(variant.id, 1), /only has 0 left|no longer available/i)

    await variant.refresh()
    assert.equal(variant.stockReserved, 1, 'the second attempt reserved nothing')
  })

  test('two concurrent checkouts cannot both take the last unit', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 1)

    const results = await Promise.allSettled([
      startCheckout(variant.id, 1),
      startCheckout(variant.id, 1),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    assert.equal(fulfilled.length, 1, 'exactly one checkout should succeed')
    assert.equal(rejected.length, 1)

    await variant.refresh()
    assert.equal(variant.stockReserved, 1)
  }).skip(CONCURRENCY_UNSUPPORTED, CONCURRENCY_REASON)

  test('rolls back the reservation when the gateway call fails', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 3)
    fake.failCreateCheckout = true

    await assert.rejects(() => startCheckout(variant.id, 2))

    await variant.refresh()
    assert.equal(variant.stockReserved, 0, 'no orphan reservation may survive')
    assert.equal(
      await Order.query()
        .count('* as total')
        .first()
        .then((r) => Number((r as never as { $extras: { total: number } }).$extras.total)),
      0
    )
  })

  test('settles a basket that totals nothing without opening a gateway', async ({ assert }) => {
    const { variant } = await seedProduct(0, 5)

    const result = await startCheckout(variant.id, 1)

    /**
     * No gateway accepts a zero charge, so a free order skips the session
     * entirely and is settled inline — but through `markOrderPaid`, so it is
     * indistinguishable from a paid order everywhere downstream.
     */
    assert.isTrue(result.paid)

    const order = await Order.findOrFail(result.orderId)
    assert.equal(order.totalAmount, 0)
    assert.equal(order.paymentStatus, 'paid')
    assert.equal(order.status, 'confirmed')

    // No gateway session was opened, so there is no payment to record.
    const payments = await db.from('ecommerce_payments').where('order_id', order.id)
    assert.lengthOf(payments, 0)

    // Stock is committed, not merely reserved — the goods have gone.
    await variant.refresh()
    assert.equal(variant.stockOnHand, 4)
    assert.equal(variant.stockReserved, 0)
  })
})

test.group('E-commerce | marking an order paid', (group) => {
  group.each.setup(async () => resetDatabase())

  test('commits stock and records the transition', async ({ assert }) => {
    const { variant } = await seedProduct(1999, 10)
    const checkout = await startCheckout(variant.id, 2)

    const result = await new OrderService().markOrderPaid(checkout.orderId, {
      gatewayPaymentId: 'fake_1',
      amount: 3998,
      currency: 'USD',
      source: 'webhook',
    })

    assert.isTrue(result.changed)
    assert.equal(result.order.paymentStatus, 'paid')
    assert.equal(result.order.status, 'confirmed')
    assert.isNull(result.order.reservationExpiresAt)

    await variant.refresh()
    assert.equal(variant.stockOnHand, 8, 'units have left the shelf')
    assert.equal(variant.stockReserved, 0, 'the hold is released')
  })

  test('is idempotent — a second call changes nothing', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 5)
    const checkout = await startCheckout(variant.id, 1)

    const evidence = {
      gatewayPaymentId: 'fake_1',
      amount: 1000,
      currency: 'USD',
      source: 'webhook' as const,
    }

    const first = await new OrderService().markOrderPaid(checkout.orderId, evidence)
    const second = await new OrderService().markOrderPaid(checkout.orderId, evidence)

    assert.isTrue(first.changed)
    assert.isFalse(second.changed, 'the duplicate must be a no-op')

    await variant.refresh()
    assert.equal(variant.stockOnHand, 4, 'stock was decremented exactly once')
  })

  test('two concurrent calls settle the order exactly once', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 5)
    const checkout = await startCheckout(variant.id, 1)

    const evidence = {
      gatewayPaymentId: 'fake_1',
      amount: 1000,
      currency: 'USD',
      source: 'webhook' as const,
    }

    /** The webhook and the return page arriving at the same instant. */
    const [a, b] = await Promise.all([
      new OrderService().markOrderPaid(checkout.orderId, evidence),
      new OrderService().markOrderPaid(checkout.orderId, { ...evidence, source: 'pull' }),
    ])

    assert.equal([a.changed, b.changed].filter(Boolean).length, 1)

    await variant.refresh()
    assert.equal(variant.stockOnHand, 4)
  }).skip(CONCURRENCY_UNSUPPORTED, CONCURRENCY_REASON)

  test('refuses an amount that does not match the order', async ({ assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const checkout = await startCheckout(variant.id, 1)

    /**
     * The heart of it: a signed, authentic webhook whose amount is wrong must
     * not settle the order. Trusting the gateway's figure blindly would let a
     * tampered or misconfigured session pay a £19.99 order with 1p.
     */
    await assert.rejects(
      () =>
        new OrderService().markOrderPaid(checkout.orderId, {
          gatewayPaymentId: 'fake_1',
          amount: 1,
          currency: 'USD',
          source: 'webhook',
        }),
      /does not match/i
    )

    const order = await Order.findOrFail(checkout.orderId)
    assert.equal(order.paymentStatus, 'unpaid')

    const flagged = await AuditLog.query().where('action', 'order.payment_amount_mismatch')
    assert.lengthOf(flagged, 1, 'the mismatch is recorded for a human')
  })

  test('refuses a currency that does not match', async ({ assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const checkout = await startCheckout(variant.id, 1)

    await assert.rejects(() =>
      new OrderService().markOrderPaid(checkout.orderId, {
        gatewayPaymentId: 'fake_1',
        amount: 1999,
        currency: 'EUR',
        source: 'webhook',
      })
    )
  })
})

test.group('E-commerce | order expiry', (group) => {
  group.each.setup(async () => resetDatabase())

  test('releases stock once the window has passed', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 5)
    const checkout = await startCheckout(variant.id, 2)

    await Order.query()
      .where('id', checkout.orderId)
      .update({ reservation_expires_at: DateTime.now().minus({ hours: 1 }).toSQL() })

    const expired = await new OrderService().expireStaleOrders()
    assert.equal(expired, 1)

    await variant.refresh()
    assert.equal(variant.stockReserved, 0, 'the hold is released')
    assert.equal(variant.stockOnHand, 5, 'nothing was sold')

    const order = await Order.findOrFail(checkout.orderId)
    assert.equal(order.status, 'cancelled')
  })

  test('never expires an order that was paid first', async ({ assert }) => {
    const { variant } = await seedProduct(1000, 5)
    const checkout = await startCheckout(variant.id, 1)

    await new OrderService().markOrderPaid(checkout.orderId, {
      gatewayPaymentId: 'fake_1',
      amount: 1000,
      currency: 'USD',
      source: 'webhook',
    })

    // Backdate anyway — the guard is the payment status, not the clock.
    await Order.query()
      .where('id', checkout.orderId)
      .update({ reservation_expires_at: DateTime.now().minus({ hours: 1 }).toSQL() })

    const expired = await new OrderService().expireStaleOrders()
    assert.equal(expired, 0)

    const order = await Order.findOrFail(checkout.orderId)
    assert.equal(order.paymentStatus, 'paid')
    assert.notEqual(order.status, 'cancelled')
  })
})

test.group('E-commerce | webhooks', (group) => {
  group.each.setup(async () => resetDatabase())

  test('an unverified body is rejected and never processed', async ({ client, assert }) => {
    const res = await postRaw(
      client,
      '/api/webhooks/stripe',
      '{"id":"evt_1","type":"checkout.session.completed"}',
      UNSIGNED
    )

    res.assertStatus(400)

    assert.lengthOf(await WebhookEvent.all(), 0, 'nothing may be recorded from an unverified body')

    const flagged = await AuditLog.query().where('action', 'webhook.verification_failed')
    assert.lengthOf(flagged, 1)
  })

  test('reaches the endpoint without a CSRF token', async ({ client }) => {
    /**
     * Gateways cannot send a CSRF token. If the exemption in `config/shield.ts`
     * regressed, this would come back as a CSRF failure rather than a signature
     * one — so the 400 here is proof the request got as far as verification.
     */
    const res = await postRaw(client, '/api/webhooks/stripe', '{"id":"evt_csrf"}', UNSIGNED)

    res.assertStatus(400)
  })

  test('processes a verified delivery exactly once', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const checkout = await startCheckout(variant.id, 1)

    const paymentId = [...fake.sessions.keys()][0]!
    fake.markPaid(paymentId)

    const body = JSON.stringify({
      id: 'evt_paid_1',
      type: 'checkout.session.completed',
      data: { object: { id: paymentId } },
    })

    const first = await postRaw(client, '/api/webhooks/stripe', body, SIGNED)

    first.assertStatus(200)
    first.assertBodyContains({ status: 'processed' })

    const order = await Order.findOrFail(checkout.orderId)
    assert.equal(order.paymentStatus, 'paid')

    await variant.refresh()
    assert.equal(variant.stockOnHand, 4)

    /** The same delivery again — gateways retry, and they retry a lot. */
    const second = await postRaw(client, '/api/webhooks/stripe', body, SIGNED)

    second.assertStatus(200)
    second.assertBodyContains({ status: 'duplicate' })

    await variant.refresh()
    assert.equal(variant.stockOnHand, 4, 'stock must not be decremented twice')
    assert.lengthOf(await WebhookEvent.all(), 1, 'one row per delivery id')
  })

  test('records the raw payload byte-for-byte', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 5)
    await startCheckout(variant.id, 1)
    const paymentId = [...fake.sessions.keys()][0]!

    /**
     * Awkward on purpose: keys out of alphabetical order, a multi-byte symbol
     * and an escape sequence. Signature verification runs over the exact bytes,
     * so if `request.raw()` ever stopped returning them verbatim — the risk
     * flagged before this phase began — a re-serialised copy would differ here.
     */
    const body =
      `{"z_last":1,"id":"evt_raw","type":"checkout.session.completed",` +
      `"note":"€ line\\nbreak","data":{"object":{"id":"${paymentId}"}}}`

    const res = await postRaw(client, '/api/webhooks/stripe', body, SIGNED)

    res.assertStatus(200)

    const recorded = await WebhookEvent.findByOrFail('event_id', 'evt_raw')
    // The driver parsed exactly what was sent, including the awkward bits.
    assert.equal((recorded.payload as { note?: string }).note, '€ line\nbreak')
    assert.equal((recorded.payload as { z_last?: number }).z_last, 1)
  })

  test('an unrecognised event type is recorded but not acted on', async ({ client, assert }) => {
    const res = await postRaw(
      client,
      '/api/webhooks/stripe',
      '{"id":"evt_unknown","type":"customer.updated"}',
      SIGNED
    )

    res.assertStatus(200)
    res.assertBodyContains({ status: 'ignored' })

    const recorded = await WebhookEvent.findByOrFail('event_id', 'evt_unknown')
    assert.equal(recorded.status, 'ignored')
  })

  test('the reconcile sweep re-drives a delivery the worker never handled', async ({
    client,
    assert,
  }) => {
    const { variant } = await seedProduct(1999, 5)
    const checkout = await startCheckout(variant.id, 1)
    const paymentId = [...fake.sessions.keys()][0]!

    // A delivery arrives while the payment is still pending, so it is ignored…
    await postRawSigned(
      client,
      '/api/webhooks/stripe',
      JSON.stringify({
        id: 'evt_late',
        type: 'checkout.session.completed',
        data: { object: { id: paymentId } },
      })
    )

    // …then the payment completes, and the sweep picks it back up.
    fake.markPaid(paymentId)
    await WebhookEvent.query().where('event_id', 'evt_late').update({ status: 'received' })

    const result = await new WebhookService().reconcile()
    assert.equal(result.processed, 1)

    const order = await Order.findOrFail(checkout.orderId)
    assert.equal(order.paymentStatus, 'paid')
  })
})

test.group('E-commerce | refunds', (group) => {
  group.each.setup(async () => resetDatabase())

  /** A paid order for £19.99, ready to refund. */
  async function paidOrder(price = 1999, stock = 5) {
    const { variant } = await seedProduct(price, stock)
    const checkout = await startCheckout(variant.id, 1)
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

  test('refunds in full and restocks', async ({ assert }) => {
    const { orderId, variant, price } = await paidOrder()

    const refund = await new RefundService().refund(
      { orderId, amount: price, reason: 'Returned' },
      { type: 'user', id: '1', label: 'admin@driftless.local' }
    )

    assert.equal(refund.amount, price)
    assert.equal(refund.status, 'succeeded')

    const order = await Order.findOrFail(orderId)
    assert.equal(order.paymentStatus, 'refunded')
    assert.equal(order.refundedAmount, price)

    await variant.refresh()
    assert.equal(variant.stockOnHand, 5, 'the unit went back on the shelf')
  })

  test('records a partial refund without restocking', async ({ assert }) => {
    const { orderId, variant } = await paidOrder(1999)

    await new RefundService().refund(
      { orderId, amount: 500 },
      { type: 'user', id: '1', label: 'admin@driftless.local' }
    )

    const order = await Order.findOrFail(orderId)
    assert.equal(order.paymentStatus, 'partially_refunded')
    assert.equal(order.refundedAmount, 500)

    await variant.refresh()
    /**
     * A partial refund is usually a price adjustment, not a returned item.
     * Guessing which units came back would create phantom stock.
     */
    assert.equal(variant.stockOnHand, 4, 'stock is untouched by a partial refund')
  })

  test('cannot refund more than was taken, across several refunds', async ({ assert }) => {
    const { orderId } = await paidOrder(1999)
    const actor = { type: 'user' as const, id: '1', label: 'admin@driftless.local' }
    const service = new RefundService()

    await service.refund({ orderId, amount: 1000 }, actor)
    await service.refund({ orderId, amount: 999 }, actor)

    /**
     * The ceiling is enforced by a conditional UPDATE, not by reading the order
     * and checking in JavaScript — so it holds even when two agents refund the
     * same order at the same moment.
     */
    await assert.rejects(() => service.refund({ orderId, amount: 1 }, actor), /left to refund/i)

    const order = await Order.findOrFail(orderId)
    assert.equal(order.refundedAmount, 1999, 'never more than the order total')
    assert.equal(order.paymentStatus, 'refunded')
  })

  test('rejects a refund larger than the order', async ({ assert }) => {
    const { orderId } = await paidOrder(1999)

    await assert.rejects(
      () =>
        new RefundService().refund(
          { orderId, amount: 999_999 },
          { type: 'user', id: '1', label: 'admin@driftless.local' }
        ),
      /left to refund/i
    )

    const order = await Order.findOrFail(orderId)
    assert.equal(order.refundedAmount, 0)
    assert.equal(order.paymentStatus, 'paid')
  })

  test('rejects a zero or negative refund', async ({ assert }) => {
    const { orderId } = await paidOrder()
    const actor = { type: 'user' as const, id: '1', label: 'admin@driftless.local' }

    await assert.rejects(() => new RefundService().refund({ orderId, amount: 0 }, actor))
    await assert.rejects(() => new RefundService().refund({ orderId, amount: -500 }, actor))
  })

  test('refuses to refund an unpaid order', async ({ assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const checkout = await startCheckout(variant.id, 1)

    await assert.rejects(
      () =>
        new RefundService().refund(
          { orderId: checkout.orderId, amount: 100 },
          { type: 'user', id: '1', label: 'admin@driftless.local' }
        ),
      /has not been paid/i
    )
  })

  test('passes a stable idempotency key to the gateway', async ({ assert }) => {
    const { orderId } = await paidOrder(1999)

    await new RefundService().refund(
      { orderId, amount: 500 },
      { type: 'user', id: '1', label: 'admin@driftless.local' }
    )

    assert.lengthOf(fake.refunds, 1)
    /**
     * The gateway deduplicates on this key, so a retried request returns the
     * original refund rather than crediting the customer twice.
     */
    assert.match(fake.refunds[0]!.idempotencyKey, /^refund_.+_0_500$/)
  })

  test('records the refund in the audit log', async ({ assert }) => {
    const { orderId, price } = await paidOrder()

    await new RefundService().refund(
      { orderId, amount: price, reason: 'Damaged' },
      { type: 'user', id: '1', label: 'admin@driftless.local' }
    )

    const entries = await AuditLog.query().where('action', 'order.refunded')
    assert.lengthOf(entries, 1)
    assert.equal(entries[0]!.amount, price)
    assert.equal(entries[0]!.currency, 'USD')
  })
})

test.group('E-commerce | idempotency keys', (group) => {
  group.each.setup(async () => resetDatabase())

  test('replays the stored response for an identical retry', async ({ assert }) => {
    const service = new IdempotencyService()
    const actor = actorFingerprint(['cart-token-1'])
    const body = { lines: [{ variantId: 'v1', quantity: 1 }] }

    const first = await service.claim('key-1', actor, body)
    assert.isNull(first.replay)
    await first.complete(201, { orderId: 'order-1' })

    const second = await service.claim('key-1', actor, body)
    assert.deepEqual(second.replay, { status: 201, body: { orderId: 'order-1' } })
  })

  test('rejects the same key with a different body', async ({ assert }) => {
    const service = new IdempotencyService()
    const actor = actorFingerprint(['cart-token-1'])

    const first = await service.claim('key-2', actor, { quantity: 1 })
    await first.complete(201, { ok: true })

    await assert.rejects(
      () => service.claim('key-2', actor, { quantity: 99 }),
      /already used with a different request/i
    )
  })

  test('refuses while an identical request is still running', async ({ assert }) => {
    const service = new IdempotencyService()
    const actor = actorFingerprint(['cart-token-1'])
    const body = { quantity: 1 }

    await service.claim('key-3', actor, body)

    await assert.rejects(() => service.claim('key-3', actor, body), /still being processed/i)
  })

  test('scopes keys to the caller, so one cannot read another’s response', async ({ assert }) => {
    const service = new IdempotencyService()
    const body = { quantity: 1 }

    const mine = await service.claim('shared-key', actorFingerprint(['cart-a']), body)
    await mine.complete(201, { orderId: 'mine' })

    // Same key, different caller — a fresh claim, not a replay of someone else's.
    const theirs = await service.claim('shared-key', actorFingerprint(['cart-b']), body)
    assert.isNull(theirs.replay)
  })

  test('a released key can be retried', async ({ assert }) => {
    const service = new IdempotencyService()
    const actor = actorFingerprint(['cart-token-1'])
    const body = { quantity: 1 }

    const first = await service.claim('key-4', actor, body)
    await first.release()

    const retry = await service.claim('key-4', actor, body)
    assert.isNull(retry.replay, 'a failed attempt must not lock the caller out')
  })
})

test.group('E-commerce | gateway credentials', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the secret key never leaves the server', async ({ assert }) => {
    const SECRET = 'sk_live_supersecretvalue'

    await db.table('ecommerce_gateway_credentials').insert({
      id: newUlid(),
      gateway: 'stripe',
      mode: 'live',
      public_key: 'pk_live_x',
      secret_key_enc: null,
      enabled: false,
      created_at: DateTime.now().toSQL(),
      updated_at: DateTime.now().toSQL(),
    })

    const { default: GatewayCredentialsService } =
      await import('#modules/ecommerce/services/gateway_credentials_service')
    const service = new GatewayCredentialsService()
    await service.update('stripe', 'live', { secretKey: SECRET })

    const listed = await service.list()
    assert.notInclude(JSON.stringify(listed), SECRET)
    assert.isTrue(listed.some((c) => c.hasSecretKey))

    // …and it is genuinely encrypted at rest.
    const row = await db
      .from('ecommerce_gateway_credentials')
      .where('gateway', 'stripe')
      .where('mode', 'live')
      .first()
    assert.notInclude(String(row.secret_key_enc), SECRET)
  })

  test('a gateway cannot be enabled without a secret key', async ({ assert }) => {
    const { default: GatewayCredentialsService } =
      await import('#modules/ecommerce/services/gateway_credentials_service')
    const service = new GatewayCredentialsService()

    await assert.rejects(
      () => service.update('paypal', 'test', { enabled: true }),
      /Add a secret key/i
    )
  })
})
