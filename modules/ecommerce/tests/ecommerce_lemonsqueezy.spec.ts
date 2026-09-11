import { test } from '@japa/runner'
import crypto from 'node:crypto'
import LemonSqueezyDriver from '#modules/ecommerce/services/gateways/lemonsqueezy_driver'
import { WebhookVerificationError } from '#modules/ecommerce/services/gateways/types'
import type { ResolvedGatewayCredentials } from '#modules/ecommerce/services/gateway_credentials_service'

const SECRET = 'whsec_test'

function driver(overrides: Partial<ResolvedGatewayCredentials> = {}): LemonSqueezyDriver {
  return new LemonSqueezyDriver({
    gateway: 'lemonsqueezy',
    mode: 'test',
    publicKey: null,
    secretKey: 'test_api_key',
    webhookSecret: SECRET,
    config: { storeId: '123', variantId: '456' },
    ...overrides,
  })
}

function sign(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')
}

/** Swap the global fetch for the duration of `fn`. */
async function withFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>
) {
  const original = globalThis.fetch
  globalThis.fetch = impl as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

test.group('Lemon Squeezy driver | webhook verification', () => {
  test('accepts a correctly signed body', async ({ assert }) => {
    const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: { id: 'ord_1' } })
    const event = await driver().verifyWebhook(body, { 'x-signature': sign(body) })
    assert.equal(event.eventType, 'order_created')
    assert.equal(event.eventId, 'order_created:ord_1')
  })

  test('rejects a wrong signature and never fails open', async ({ assert }) => {
    const body = JSON.stringify({ meta: { event_name: 'order_created' }, data: { id: 'x' } })
    // Same length as a real hex digest, but wrong — exercises the compare, not the length guard.
    const wrong = 'a'.repeat(64)
    let caught: unknown
    try {
      await driver().verifyWebhook(body, { 'x-signature': wrong })
    } catch (e) {
      caught = e
    }
    assert.instanceOf(caught, WebhookVerificationError)
  })

  test('rejects a missing signature header', async ({ assert }) => {
    let caught: unknown
    try {
      await driver().verifyWebhook('{}', {})
    } catch (e) {
      caught = e
    }
    assert.instanceOf(caught, WebhookVerificationError)
  })
})

test.group('Lemon Squeezy driver | settlement', () => {
  test('maps a paid order to a paid status with its total', ({ assert }) => {
    const status = driver().settlementFromEvent({
      data: { id: 'ord_1', attributes: { status: 'paid', total: 4900, currency: 'usd' } },
    })
    assert.isNotNull(status)
    assert.equal(status!.status, 'paid')
    assert.equal(status!.amount, 4900)
    assert.equal(status!.currency, 'USD')
  })

  test('leaves a pending order pending', ({ assert }) => {
    const status = driver().settlementFromEvent({ data: { attributes: { status: 'pending' } } })
    assert.equal(status!.status, 'pending')
  })

  test('refuses to settle a live gateway from a test-mode event', ({ assert }) => {
    const live = driver({ mode: 'live' })
    const status = live.settlementFromEvent({
      meta: { test_mode: true },
      data: { attributes: { status: 'paid', total: 100, currency: 'USD' } },
    })
    assert.isNull(status)
  })

  test('settles when the event mode matches the driver mode', ({ assert }) => {
    // driver() defaults to mode 'test'.
    const status = driver().settlementFromEvent({
      meta: { test_mode: true },
      data: { attributes: { status: 'paid', total: 100, currency: 'USD' } },
    })
    assert.equal(status!.status, 'paid')
  })
})

test.group('Lemon Squeezy driver | checkout', () => {
  test('posts custom_price + the order id in custom_data and returns the url', async ({
    assert,
  }) => {
    let sent: { url: string; body: any } | null = null
    await withFetch(
      async (url, init) => {
        sent = { url, body: JSON.parse(String(init?.body)) }
        return new Response(
          JSON.stringify({ data: { id: 'chk_1', attributes: { url: 'https://ls/checkout/1' } } }),
          { status: 201 }
        )
      },
      async () => {
        const res = await driver().createCheckout({
          orderId: 'o1',
          orderNumber: 'N1',
          currency: 'USD',
          email: 'a@b.com',
          lines: [],
          shippingAmount: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 4900,
          successUrl: 'https://s/ok',
          cancelUrl: 'https://s/no',
          expiresInMinutes: 30,
        })
        assert.equal(res.gatewayPaymentId, 'chk_1')
        assert.equal(res.redirectUrl, 'https://ls/checkout/1')
      }
    )
    assert.isNotNull(sent)
    const attrs = sent!.body.data.attributes
    assert.equal(attrs.custom_price, 4900)
    assert.equal(attrs.checkout_data.custom.order_id, 'o1')
    assert.isTrue(attrs.test_mode)
    assert.equal(sent!.body.data.relationships.variant.data.id, '456')
    assert.equal(sent!.body.data.relationships.store.data.id, '123')
  })

  test('refuses to create a checkout without a store/variant', async ({ assert }) => {
    const d = driver({ config: {} })
    let caught: unknown
    try {
      await d.createCheckout({
        orderId: 'o1',
        orderNumber: 'N1',
        currency: 'USD',
        email: 'a@b.com',
        lines: [],
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 4900,
        successUrl: 'https://s/ok',
        cancelUrl: 'https://s/no',
        expiresInMinutes: 30,
      })
    } catch (e) {
      caught = e
    }
    assert.instanceOf(caught, Error)
  })
})

test.group('Lemon Squeezy driver | refunds', () => {
  test('directs refunds to the LS dashboard rather than pretending', async ({ assert }) => {
    let caught: unknown
    try {
      await driver().refund({
        gatewayPaymentId: 'chk_1',
        amount: 4900,
        currency: 'USD',
        idempotencyKey: 'k',
      })
    } catch (e) {
      caught = e
    }
    assert.instanceOf(caught, Error)
  })
})
