import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import AuditLogService from '#services/audit_log_service'
import WebhookEvent from '#modules/ecommerce/models/webhook_event'
import Payment from '#modules/ecommerce/models/payment'
import type { GatewayName } from '#modules/ecommerce/models/gateway_credential'
import OrderService from '#modules/ecommerce/services/order_service'
import { gatewayDriver } from '#modules/ecommerce/services/gateways/registry'
import type { VerifiedWebhookEvent } from '#modules/ecommerce/services/gateways/types'

const orders = new OrderService()
const audit = new AuditLogService()

/** True for a `(gateway, event_id)` unique-constraint violation (pg or SQLite). */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string }
  return (
    e?.code === '23505' ||
    e?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    e?.code === 'SQLITE_CONSTRAINT' ||
    /unique/i.test(e?.message ?? '')
  )
}

/**
 * Event types that settle a payment. Anything else is recorded and ignored —
 * an unrecognised event must never be treated as "probably paid".
 */
const PAID_EVENTS: Record<GatewayName, string[]> = {
  stripe: ['checkout.session.completed', 'checkout.session.async_payment_succeeded'],
  paypal: ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED'],
  // Lemon Squeezy (Merchant of Record) creates an order only once payment
  // succeeds, so `order_created` is the settlement event.
  lemonsqueezy: ['order_created'],
}

const FAILED_EVENTS: Record<GatewayName, string[]> = {
  stripe: ['checkout.session.async_payment_failed', 'checkout.session.expired'],
  paypal: ['PAYMENT.CAPTURE.DENIED', 'CHECKOUT.ORDER.VOIDED'],
  // LS never delivers a "checkout failed" event — an abandoned checkout simply
  // never becomes an order — so there is nothing to mark failed here.
  lemonsqueezy: [],
}

export interface WebhookOutcome {
  /** False when this delivery had already been processed. */
  processed: boolean
  status: 'processed' | 'ignored' | 'duplicate' | 'failed'
  eventType: string
}

export default class WebhookService {
  /**
   * Record a verified delivery, then act on it.
   *
   * Recording comes first, and the `(gateway, event_id)` unique index is what
   * makes the whole flow idempotent: gateways retry aggressively and deliver
   * out of order, so without this a retried `payment_succeeded` would run its
   * side effects twice — committing stock twice, paying an affiliate twice.
   *
   * A duplicate is not an error. It returns quietly so the endpoint can answer
   * 2xx and the gateway stops retrying.
   */
  async ingest(gateway: GatewayName, event: VerifiedWebhookEvent): Promise<WebhookOutcome> {
    let record: WebhookEvent
    try {
      record = await WebhookEvent.create({
        id: newUlid(),
        gateway,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.payload,
        status: 'received',
        attempts: 0,
      })
    } catch (error) {
      // A `(gateway, event_id)` unique violation means we have seen this
      // delivery — return quietly so the endpoint can answer 2xx. Any OTHER
      // error (a transient DB failure) must propagate so the endpoint answers
      // non-2xx and the gateway retries, rather than being silently dropped as a
      // "duplicate" and never processed.
      if (isUniqueViolation(error)) {
        return { processed: false, status: 'duplicate', eventType: event.eventType }
      }
      throw error
    }

    return this.process(record)
  }

  /**
   * Act on a recorded event.
   *
   * Split from `ingest` so the reconcile sweep can re-drive anything left in
   * `received` — which is what makes the queue an accelerator rather than a
   * dependency. A worker outage delays processing; it does not lose it.
   */
  async process(record: WebhookEvent): Promise<WebhookOutcome> {
    record.attempts += 1

    try {
      const paid = PAID_EVENTS[record.gateway] ?? []
      const failed = FAILED_EVENTS[record.gateway] ?? []

      if (paid.includes(record.eventType)) {
        await this.handlePaid(record)
      } else if (failed.includes(record.eventType)) {
        await this.handleFailed(record)
      } else {
        record.status = 'ignored'
        record.processedAt = DateTime.now()
        await record.save()
        return { processed: false, status: 'ignored', eventType: record.eventType }
      }

      record.status = 'processed'
      record.lastError = null
      record.processedAt = DateTime.now()
      await record.save()

      return { processed: true, status: 'processed', eventType: record.eventType }
    } catch (error) {
      record.status = 'failed'
      record.lastError = (error as Error).message.slice(0, 512)
      await record.save()

      await audit.record({
        actor: { type: 'system', label: `${record.gateway} webhook` },
        action: 'webhook.processing_failed',
        subjectType: 'webhook_event',
        subjectId: record.id,
        changes: { eventType: record.eventType, error: record.lastError },
      })

      /**
       * Rethrow so the endpoint answers non-2xx and the gateway retries. Their
       * retry schedule runs for hours, which is a better safety net than
       * anything built here.
       */
      throw error
    }
  }

  private async handlePaid(record: WebhookEvent): Promise<void> {
    const payment = await this.findPayment(record)
    if (!payment) {
      // Nothing to settle. Recorded, not an error: it may be an event for a
      // session created by a different installation sharing the account.
      record.status = 'ignored'
      return
    }

    /**
     * Ask the gateway what actually happened rather than trusting the amount in
     * the webhook body. The body is signed, so it is authentic — but a
     * misconfigured or tampered checkout session could still have collected the
     * wrong amount, and `markOrderPaid` compares against what we recorded.
     */
    /**
     * No gateway ever sends a webhook about a manual payment, so a delivery
     * that resolves to one is a mismatch — most likely a payment id collision
     * with another installation. Ignore it rather than reaching for a driver
     * that does not exist.
     */
    if (payment.gateway === 'manual') {
      record.status = 'ignored'
      return
    }

    const driver = await gatewayDriver(payment.gateway)
    /**
     * Stripe/PayPal are re-fetched by an id we stored. A Merchant-of-Record
     * gateway (Lemon Squeezy) confirms on an order our stored checkout id cannot
     * fetch, so it derives the amount from the already-verified webhook — still
     * checked against the order total by `markOrderPaid` below.
     */
    const status =
      driver.settlementFromEvent?.(record.payload as Record<string, unknown>) ??
      (await driver.fetchPaymentStatus(payment.gatewayPaymentId))

    if (status.status !== 'paid') {
      // Approved but not captured yet (PayPal), or still processing. The next
      // delivery, or the return page, will settle it.
      record.status = 'ignored'
      return
    }

    /**
     * A live event must not settle a test payment, or the reverse. Signature
     * verification already rejects an event signed with the other mode's secret,
     * but assert it here too — Lemon Squeezy is the only driver that checks mode
     * itself, and defence-in-depth on the money path is cheap. Leaves the order
     * unpaid rather than settling on an ambiguous mode.
     */
    if (driver.mode !== payment.mode) {
      await audit.record({
        actor: { type: 'system', label: `${record.gateway} webhook` },
        action: 'webhook.mode_mismatch',
        subjectType: 'webhook_event',
        subjectId: record.id,
        changes: { eventMode: driver.mode, paymentMode: payment.mode, orderId: payment.orderId },
      })
      return
    }

    /**
     * Reconciliation depends on a real amount + currency. If a driver ever
     * reports `paid` without them, do NOT fall back to our own stored figure:
     * that would hand `markOrderPaid` the order's own total to compare against
     * itself — always equal — silently skipping the amount check that is the
     * whole point of settling through it. No current driver does this; the guard
     * is here so a future one cannot bypass reconciliation. The order stays
     * unpaid and the anomaly is audited.
     */
    if (typeof status.amount !== 'number' || typeof status.currency !== 'string') {
      await audit.record({
        actor: { type: 'system', label: `${record.gateway} webhook` },
        action: 'webhook.unreconcilable_amount',
        subjectType: 'webhook_event',
        subjectId: record.id,
        changes: { orderId: payment.orderId, amount: status.amount, currency: status.currency },
      })
      return
    }

    await orders.markOrderPaid(
      payment.orderId,
      {
        gatewayPaymentId: payment.gatewayPaymentId,
        amount: status.amount,
        currency: status.currency,
        source: 'webhook',
        raw: status.raw,
      },
      { type: 'system', label: `${record.gateway} webhook` }
    )
  }

  private async handleFailed(record: WebhookEvent): Promise<void> {
    const payment = await this.findPayment(record)
    if (!payment) return

    await db.transaction(async (trx) => {
      await trx
        .from('ecommerce_payments')
        .where('id', payment.id)
        .update({
          status: record.eventType.includes('expired') ? 'expired' : 'failed',
          updated_at: DateTime.now().toSQL(),
        })
    })

    /**
     * The order is deliberately left alone. A failed attempt does not cancel an
     * order — the buyer may retry — and its reservation lapses on its own when
     * `reservationExpiresAt` passes, which the expiry sweep handles.
     */
    await audit.record({
      actor: { type: 'system', label: `${record.gateway} webhook` },
      action: 'order.payment_failed',
      subjectType: 'order',
      subjectId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      changes: { eventType: record.eventType },
    })
  }

  private async findPayment(record: WebhookEvent): Promise<Payment | null> {
    /**
     * Lemon Squeezy delivers an *order* whose id is not the *checkout* id we
     * stored, so it is linked back through the order id we passed in
     * `custom_data` — the most recent LS attempt for that order.
     */
    if (record.gateway === 'lemonsqueezy') {
      const orderId = (record.payload as { meta?: { custom_data?: { order_id?: string } } })?.meta
        ?.custom_data?.order_id
      if (orderId) {
        const payment = await Payment.query()
          .where('order_id', orderId)
          .where('gateway', 'lemonsqueezy')
          .orderBy('created_at', 'desc')
          .first()
        if (payment) return payment
      }
      return null
    }

    const payload = record.payload as { data?: { object?: { id?: string } }; resource?: unknown }
    const fromStripe = payload?.data?.object?.id
    const resource = payload?.resource as
      | { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } }
      | undefined

    const candidates = [
      fromStripe,
      resource?.supplementary_data?.related_ids?.order_id,
      resource?.id,
    ].filter((v): v is string => typeof v === 'string' && v.length > 0)

    for (const candidate of candidates) {
      const payment = await Payment.query().where('gateway_payment_id', candidate).first()
      if (payment) return payment
    }

    return null
  }

  /**
   * Re-drive deliveries that were recorded but never completed.
   *
   * The safety net behind the queue: if the worker was down, or a transient
   * gateway error made processing fail, this picks the work back up. Idempotent
   * by construction, because everything it calls is.
   */
  async reconcile(limit = 50): Promise<{ processed: number; failed: number }> {
    const pending = await WebhookEvent.query()
      .whereIn('status', ['received', 'failed'])
      .where('attempts', '<', 10)
      .orderBy('created_at', 'asc')
      .limit(limit)

    let processed = 0
    let failed = 0

    for (const record of pending) {
      try {
        const outcome = await this.process(record)
        if (outcome.processed) processed++
      } catch {
        failed++
      }
    }

    return { processed, failed }
  }
}
