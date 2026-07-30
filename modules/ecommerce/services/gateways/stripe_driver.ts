import Stripe from 'stripe'
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

/**
 * Stripe Checkout (hosted).
 *
 * The buyer is redirected to Stripe's own page, so card details never touch
 * this server and PCI scope stays with Stripe. We hand over line items whose
 * amounts we computed ourselves and get back a session id we store.
 */
export default class StripeDriver implements PaymentGatewayDriver {
  readonly name = 'stripe' as const
  readonly mode: GatewayMode

  private client: Stripe
  private webhookSecret: string | null

  constructor(credentials: ResolvedGatewayCredentials) {
    this.mode = credentials.mode
    this.webhookSecret = credentials.webhookSecret
    this.client = new Stripe(credentials.secretKey, {
      // Pinned rather than floating: an API version bump changing a field shape
      // under us is not something to discover in production checkout. This must
      // match the version the installed SDK's types were generated against —
      // bump both together, never one alone.
      apiVersion: '2026-06-24.dahlia',
      typescript: true,
    })
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const currency = input.currency.toLowerCase()

    /**
     * Product lines go over as-is; shipping, tax and discount go as their own
     * lines rather than through Stripe's shipping/tax features.
     *
     * Two reasons. PayPal has no equivalent of Stripe Tax, so delegating would
     * make the same basket total differently depending on which button the
     * buyer pressed. And the total Stripe collects then provably equals the
     * total we computed, which is what the post-payment equality check relies on.
     */
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency,
        unit_amount: line.unitAmount,
        product_data: {
          name: line.name,
          ...(line.description ? { description: line.description } : {}),
          ...(line.imageUrl ? { images: [line.imageUrl] } : {}),
        },
      },
    }))

    if (input.shippingAmount > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: input.shippingAmount,
          product_data: { name: 'Shipping' },
        },
      })
    }

    if (input.taxAmount > 0) {
      lineItems.push({
        quantity: 1,
        price_data: { currency, unit_amount: input.taxAmount, product_data: { name: 'Tax' } },
      })
    }

    const session = await this.client.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: input.email,
      client_reference_id: input.orderId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // Stripe expires the session on its side at the same moment our stock
      // reservation lapses, so an abandoned checkout cannot be paid after we
      // have already released the goods. Stripe requires 30 minutes minimum.
      expires_at: Math.floor(Date.now() / 1000) + Math.max(input.expiresInMinutes, 30) * 60,
      metadata: {
        order_id: input.orderId,
        order_number: input.orderNumber,
        // Recorded so a mismatch is visible in the dashboard during a dispute.
        expected_total: String(input.totalAmount),
      },
    })

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL')
    }

    return { gatewayPaymentId: session.id, redirectUrl: session.url }
  }

  async fetchPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentStatus> {
    const session = await this.client.checkout.sessions.retrieve(gatewayPaymentId)
    return this.toStatus(session)
  }

  /**
   * Verify the signature over the **raw** body.
   *
   * `constructEvent` recomputes the HMAC across the exact bytes Stripe signed,
   * so it must be given the untouched request body. Passing a re-serialised
   * object fails for any payload where key order or unicode escaping differs —
   * and a check that can fail for benign reasons is one someone will eventually
   * be tempted to bypass.
   */
  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhookEvent> {
    if (!this.webhookSecret) {
      throw new WebhookVerificationError('No webhook signing secret is configured for Stripe.')
    }

    const signature = headers['stripe-signature']
    if (!signature) {
      throw new WebhookVerificationError('Missing Stripe-Signature header.')
    }

    let event: Stripe.Event
    try {
      /**
       * Stripe's own default tolerance (5 minutes) applies, which is what
       * makes this replay-resistant: a captured request cannot be replayed
       * later, and the event-id uniqueness constraint covers replays inside
       * the window.
       */
      event = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
    } catch (error) {
      throw new WebhookVerificationError(
        `Stripe signature verification failed: ${(error as Error).message}`
      )
    }

    const object = event.data.object as { id?: string; object?: string }
    const gatewayPaymentId =
      object?.object === 'checkout.session' ? (object.id ?? null) : this.paymentIdFromEvent(event)

    return {
      eventId: event.id,
      eventType: event.type,
      gatewayPaymentId,
      payload: event as unknown as Record<string, unknown>,
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // A Checkout Session is not itself refundable; the PaymentIntent behind it is.
    const session = await this.client.checkout.sessions.retrieve(input.gatewayPaymentId)
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null)

    if (!paymentIntentId) {
      throw new Error('This Stripe session has no payment to refund.')
    }

    const refund = await this.client.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: input.amount,
        ...(input.reason ? { metadata: { reason: input.reason.slice(0, 500) } } : {}),
      },
      // Stripe deduplicates on this key, so a retried request returns the
      // original refund rather than issuing a second one.
      { idempotencyKey: input.idempotencyKey }
    )

    return {
      gatewayRefundId: refund.id,
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'failed'
            ? 'failed'
            : 'pending',
      raw: refund as unknown as Record<string, unknown>,
    }
  }

  async verifyCredentials(): Promise<void> {
    // Cheapest authenticated call Stripe offers.
    await this.client.balance.retrieve()
  }

  private toStatus(session: Stripe.Checkout.Session): GatewayPaymentStatus {
    let status: GatewayPaymentStatus['status'] = 'pending'

    if (session.payment_status === 'paid') status = 'paid'
    else if (session.status === 'expired') status = 'expired'
    else if (session.status === 'complete' && session.payment_status === 'unpaid') status = 'failed'

    return {
      gatewayPaymentId: session.id,
      status,
      amount: session.amount_total ?? null,
      currency: session.currency ? session.currency.toUpperCase() : null,
      raw: session as unknown as Record<string, unknown>,
    }
  }

  /** Best-effort session id for events that are not themselves sessions. */
  private paymentIdFromEvent(event: Stripe.Event): string | null {
    const object = event.data.object as unknown as Record<string, unknown>
    const metadata = object?.metadata as Record<string, unknown> | undefined
    if (typeof metadata?.checkout_session_id === 'string') return metadata.checkout_session_id
    return null
  }
}
