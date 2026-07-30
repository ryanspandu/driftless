import type { GatewayMode, GatewayName } from '#modules/ecommerce/models/gateway_credential'

/**
 * One line on a hosted checkout page.
 *
 * Amounts are integer minor units, computed by us. The gateway is told what to
 * charge; it is never asked what something costs.
 */
export interface CheckoutLine {
  name: string
  description?: string | null
  /** Minor units. */
  unitAmount: number
  quantity: number
  imageUrl?: string | null
}

export interface CreateCheckoutInput {
  orderId: string
  orderNumber: string
  currency: string
  email: string
  lines: CheckoutLine[]
  /** Shipping as its own line, so the gateway's total matches ours exactly. */
  shippingAmount: number
  taxAmount: number
  discountAmount: number
  /** What we expect the gateway to collect, for the post-hoc equality check. */
  totalAmount: number
  successUrl: string
  cancelUrl: string
  /** Minutes until the session expires, matching our stock reservation. */
  expiresInMinutes: number
}

export interface CreateCheckoutResult {
  /** The gateway's id for this attempt — stored, and unique per payment. */
  gatewayPaymentId: string
  /** Where to send the buyer. */
  redirectUrl: string
}

/** The subset of a gateway payment we care about, normalised across providers. */
export interface GatewayPaymentStatus {
  gatewayPaymentId: string
  /** `paid` is the only status that may settle an order. */
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled'
  /** What the gateway says was actually collected, in minor units. */
  amount: number | null
  currency: string | null
  raw: Record<string, unknown>
}

/** A webhook delivery, after signature verification. */
export interface VerifiedWebhookEvent {
  /** The gateway's event id — the idempotency key for the whole flow. */
  eventId: string
  eventType: string
  /** Present when the event concerns a specific payment. */
  gatewayPaymentId: string | null
  payload: Record<string, unknown>
}

export interface RefundInput {
  gatewayPaymentId: string
  /** Minor units. */
  amount: number
  currency: string
  reason?: string | null
  /** Passed to the gateway so a retried refund does not double-credit. */
  idempotencyKey: string
}

export interface RefundResult {
  gatewayRefundId: string
  status: 'pending' | 'succeeded' | 'failed'
  raw: Record<string, unknown>
}

/** Raised when a webhook body fails signature verification. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
  }
}

/**
 * What every payment gateway must provide.
 *
 * The shape is deliberately narrow. Anything a gateway can do that is not on
 * this interface is not something the checkout flow is allowed to depend on,
 * which is what keeps Stripe and PayPal behaving identically from the caller's
 * point of view.
 */
export interface PaymentGatewayDriver {
  readonly name: GatewayName
  readonly mode: GatewayMode

  /** Create a hosted checkout session and return where to send the buyer. */
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>

  /**
   * Ask the gateway what actually happened to a payment.
   *
   * Called from the return page, using a `gatewayPaymentId` **we stored**, never
   * one taken from the URL. This is the path that lets a buyer see a confirmed
   * order before the webhook lands.
   */
  fetchPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentStatus>

  /**
   * Verify a webhook body and signature, and normalise it.
   *
   * Receives the **raw** body string, never a re-serialised object: the
   * signature covers the exact bytes sent. Throws `WebhookVerificationError`
   * when verification fails — it must never fail open.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhookEvent>

  refund(input: RefundInput): Promise<RefundResult>

  /** Cheap call used by the "test connection" button. Throws on failure. */
  verifyCredentials(): Promise<void>
}
