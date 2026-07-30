import { newUlid } from '#services/ulid_service'
import type { GatewayMode, GatewayName } from '#modules/ecommerce/models/gateway_credential'
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
 * An in-memory gateway for tests.
 *
 * Registered through `overrideGateway()` so every layer above the driver — the
 * checkout service, the order state machine, the webhook pipeline — runs its
 * real code path against a payment provider whose behaviour the test controls.
 *
 * The alternative, hitting Stripe's and PayPal's sandboxes, would make the
 * suite slow, flaky, and dependent on someone's account still existing.
 */
export default class FakeGatewayDriver implements PaymentGatewayDriver {
  readonly name: GatewayName
  readonly mode: GatewayMode = 'test'

  /** Sessions this driver has created, keyed by its own payment id. */
  readonly sessions = new Map<
    string,
    { input: CreateCheckoutInput; status: GatewayPaymentStatus['status']; amount: number }
  >()

  readonly refunds: RefundInput[] = []

  /** Set to make `createCheckout` throw, to exercise rollback paths. */
  failCreateCheckout = false

  constructor(name: GatewayName = 'stripe') {
    this.name = name
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (this.failCreateCheckout) {
      throw new Error('Simulated gateway failure')
    }

    const gatewayPaymentId = `fake_${newUlid()}`
    this.sessions.set(gatewayPaymentId, {
      input,
      status: 'pending',
      amount: input.totalAmount,
    })

    return { gatewayPaymentId, redirectUrl: `https://gateway.test/pay/${gatewayPaymentId}` }
  }

  /** Simulate the buyer completing payment. */
  markPaid(gatewayPaymentId: string, amountOverride?: number): void {
    const session = this.sessions.get(gatewayPaymentId)
    if (!session) throw new Error(`No fake session ${gatewayPaymentId}`)
    session.status = 'paid'
    if (amountOverride !== undefined) session.amount = amountOverride
  }

  async fetchPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentStatus> {
    const session = this.sessions.get(gatewayPaymentId)
    if (!session) {
      return {
        gatewayPaymentId,
        status: 'failed',
        amount: null,
        currency: null,
        raw: {},
      }
    }

    return {
      gatewayPaymentId,
      status: session.status,
      amount: session.amount,
      currency: session.input.currency,
      raw: { id: gatewayPaymentId, fake: true },
    }
  }

  /**
   * Accepts a body signed with the literal header `fake-signature: valid`.
   *
   * Crude on purpose: the real signature algorithms are tested against the real
   * drivers. What this exercises is everything *around* verification — that a
   * rejected body never reaches processing, and that a verified one is recorded
   * exactly once.
   */
  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhookEvent> {
    if (headers['fake-signature'] !== 'valid') {
      throw new WebhookVerificationError('Fake signature mismatch')
    }

    const parsed = JSON.parse(rawBody) as {
      id?: string
      type?: string
      data?: { object?: { id?: string } }
    }

    return {
      eventId: parsed.id ?? newUlid(),
      eventType: parsed.type ?? 'checkout.session.completed',
      gatewayPaymentId: parsed.data?.object?.id ?? null,
      payload: parsed as Record<string, unknown>,
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.refunds.push(input)
    return {
      gatewayRefundId: `fake_refund_${newUlid()}`,
      status: 'succeeded',
      raw: { fake: true },
    }
  }

  async verifyCredentials(): Promise<void> {
    // Always fine.
  }
}
