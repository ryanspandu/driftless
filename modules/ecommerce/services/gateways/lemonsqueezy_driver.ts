import crypto from 'node:crypto'
import { publicError } from '#exceptions/public_error'
import type { GatewayMode } from '#modules/ecommerce/models/gateway_credential'
import type { ResolvedGatewayCredentials } from '#modules/ecommerce/services/gateway_credentials_service'
import {
  WebhookVerificationError,
  type CreateCheckoutInput,
  type CreateCheckoutResult,
  type GatewayPaymentStatus,
  type PaymentGatewayDriver,
  type RefundInput,
  type RefundResult,
  type VerifiedWebhookEvent,
} from '#modules/ecommerce/services/gateways/types'

const API = 'https://api.lemonsqueezy.com/v1'

/**
 * Lemon Squeezy (Merchant of Record).
 *
 * Lemon Squeezy is the seller of record: the buyer is redirected to its hosted
 * checkout, and Lemon Squeezy handles payment, tax and compliance. Unlike Stripe
 * and PayPal it has no concept of arbitrary line items — a checkout is always
 * created against a **variant**, so the operator makes one catch-all product
 * (its store id + variant id live in `config`) and every order is a single
 * `custom_price` line against it.
 *
 * Two consequences the rest of the flow has to respect:
 *  - The store must be set to **tax-inclusive** pricing so the amount collected
 *    equals `custom_price` (our order total). Otherwise LS adds tax on top and
 *    the total-equality check in `markOrderPaid` rejects the settlement.
 *  - LS confirms on an **order** it creates, which our stored **checkout** id
 *    cannot fetch. Settlement therefore comes from the HMAC-verified webhook
 *    (`settlementFromEvent`), linked back to our order via `custom_data`.
 */
export default class LemonSqueezyDriver implements PaymentGatewayDriver {
  readonly name = 'lemonsqueezy' as const
  readonly mode: GatewayMode

  private apiKey: string
  private webhookSecret: string | null
  private storeId: string
  private variantId: string

  constructor(credentials: ResolvedGatewayCredentials) {
    this.mode = credentials.mode
    this.apiKey = credentials.secretKey
    this.webhookSecret = credentials.webhookSecret
    this.storeId = credentials.config.storeId ?? ''
    this.variantId = credentials.config.variantId ?? ''
  }

  private async api(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        ...(init?.headers ?? {}),
      },
    })
    const text = await res.text()
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    if (!res.ok) {
      // LS errors are JSON:API `errors: [{ detail }]`.
      const errors = (body as { errors?: Array<{ detail?: string; title?: string }> }).errors
      const detail = errors?.[0]?.detail ?? errors?.[0]?.title ?? `HTTP ${res.status}`
      throw new Error(`Lemon Squeezy: ${detail}`)
    }
    return body
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (!this.storeId || !this.variantId) {
      throw new Error(
        'Lemon Squeezy needs a Store ID and Variant ID (the catch-all product) — set them in E-commerce → Settings → Payments.'
      )
    }

    // `custom_price` is what LS charges; with tax-inclusive store pricing it is
    // exactly our order total. Expiry mirrors our stock reservation. The order id
    // rides along in `custom_data` so the order webhook can be linked back to us.
    const expiresAt = new Date(
      Date.now() + Math.max(input.expiresInMinutes, 1) * 60_000
    ).toISOString()

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: input.totalAmount,
          product_options: {
            redirect_url: input.successUrl,
            receipt_button_text: 'Return to store',
          },
          checkout_options: { embed: false },
          checkout_data: {
            email: input.email,
            custom: { order_id: input.orderId, order_number: input.orderNumber },
          },
          expires_at: expiresAt,
          test_mode: this.mode === 'test',
        },
        relationships: {
          store: { data: { type: 'stores', id: this.storeId } },
          variant: { data: { type: 'variants', id: this.variantId } },
        },
      },
    }

    const result = (await this.api('/checkouts', {
      method: 'POST',
      body: JSON.stringify(body),
    })) as { data?: { id?: string; attributes?: { url?: string } } }

    const id = result.data?.id
    const url = result.data?.attributes?.url
    if (!id || !url) throw new Error('Lemon Squeezy did not return a checkout URL')

    return { gatewayPaymentId: id, redirectUrl: url }
  }

  /**
   * A checkout id cannot be resolved to an order via the API, so the return page
   * cannot confirm a Lemon Squeezy payment directly — it reports `pending` and
   * the webhook settles the order (usually within seconds).
   */
  async fetchPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentStatus> {
    return {
      gatewayPaymentId,
      status: 'pending',
      amount: null,
      currency: null,
      raw: {},
    }
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhookEvent> {
    if (!this.webhookSecret) {
      throw new WebhookVerificationError(
        'No webhook signing secret is configured for Lemon Squeezy.'
      )
    }

    const signature = headers['x-signature']
    if (!signature) {
      throw new WebhookVerificationError('Missing X-Signature header.')
    }

    // LS signs the raw body with HMAC-SHA256 (hex). Constant-time compare, and
    // never fail open: a length mismatch is a failed verification, not an error.
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(signature, 'utf8')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new WebhookVerificationError('Lemon Squeezy signature verification failed.')
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      throw new WebhookVerificationError('Lemon Squeezy webhook body is not valid JSON.')
    }

    const meta = (payload.meta ?? {}) as { event_name?: string }
    const data = (payload.data ?? {}) as { id?: string }
    const eventType = meta.event_name ?? 'unknown'

    return {
      // LS carries no delivery id in the body; event_name + resource id is a
      // stable idempotency key (an order is created once).
      eventId: `${eventType}:${data.id ?? 'unknown'}`,
      eventType,
      gatewayPaymentId: data.id ?? null,
      payload,
    }
  }

  /**
   * Settlement from the already-verified order webhook. The body is HMAC-signed
   * (authentic), and `markOrderPaid` still checks the amount against the order
   * total, so trusting the authenticated amount here does not weaken the guard.
   */
  settlementFromEvent(payload: Record<string, unknown>): GatewayPaymentStatus | null {
    /**
     * A test-mode event must never settle a live gateway, and vice versa. Lemon
     * Squeezy signs both with the same store secret, so the mode is only
     * distinguishable from the payload's `test_mode` flag — refuse a mismatch.
     */
    const meta = (payload.meta ?? {}) as { test_mode?: boolean }
    if (typeof meta.test_mode === 'boolean' && meta.test_mode !== (this.mode === 'test')) {
      return null
    }

    const data = (payload.data ?? {}) as {
      id?: string
      attributes?: { status?: string; total?: number; currency?: string }
    }
    const attrs = data.attributes
    if (!attrs) return null

    const status: GatewayPaymentStatus['status'] =
      attrs.status === 'paid'
        ? 'paid'
        : attrs.status === 'refunded'
          ? 'paid' // already collected; a refund is a later, separate event
          : attrs.status === 'failed'
            ? 'failed'
            : 'pending'

    return {
      gatewayPaymentId: data.id ?? '',
      status,
      amount: typeof attrs.total === 'number' ? attrs.total : null,
      currency: attrs.currency ? attrs.currency.toUpperCase() : null,
      raw: (data as unknown as Record<string, unknown>) ?? {},
    }
  }

  /**
   * Lemon Squeezy refunds are issued from its dashboard, and the API keys us to
   * a checkout id rather than the order id a refund needs. Fail loudly with an
   * actionable message rather than pretend to have refunded.
   */
  async refund(_input: RefundInput): Promise<RefundResult> {
    throw publicError.unprocessable(
      'Refund this order from the Lemon Squeezy dashboard (Orders → the order → Refund). Lemon Squeezy is not refunded from here.',
      'lemonsqueezy_refund_unsupported'
    )
  }

  async verifyCredentials(): Promise<void> {
    // Cheapest authenticated call — proves the API key is valid.
    await this.api('/users/me')
    if (!this.storeId || !this.variantId) {
      throw new Error('Add a Store ID and Variant ID (your catch-all product) to take payments.')
    }
  }
}
