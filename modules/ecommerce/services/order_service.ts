import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { newUlid } from '#services/ulid_service'
import AuditLogService from '#services/audit_log_service'
import { publicError } from '#exceptions/public_error'
import Order from '#modules/ecommerce/models/order'
import type { OrderStatus } from '#modules/ecommerce/models/order'
import OrderItem from '#modules/ecommerce/models/order_item'
import OrderEvent from '#modules/ecommerce/models/order_event'
import Payment from '#modules/ecommerce/models/payment'
import InventoryService from '#modules/ecommerce/services/inventory_service'
import { assertOrderTransition } from '#modules/ecommerce/services/order_state_machine'

const inventory = new InventoryService()
const audit = new AuditLogService()

/** Who or what caused a transition. */
export interface OrderActor {
  type: 'user' | 'customer' | 'worker' | 'system'
  id?: string | null
  label?: string | null
}

export interface MarkPaidEvidence {
  gatewayPaymentId: string
  /** What the gateway says it actually collected, in minor units. */
  amount: number
  currency: string
  /**
   * Where this came from.
   *
   * `free` is the one value that does not describe money arriving: a basket a
   * discount took to zero. It still goes through this method rather than
   * around it, so stock, download grants and commission are handled by the same
   * code that handles a paid order.
   */
  source: 'webhook' | 'pull' | 'manual' | 'free'
  raw?: Record<string, unknown>
}

export interface MarkPaidResult {
  /** False when the order was already paid — the call was a no-op. */
  changed: boolean
  order: Order
}

export default class OrderService {
  /**
   * The **only** way an order becomes paid.
   *
   * Two properties make this safe, and both live in the SQL rather than in
   * JavaScript:
   *
   * 1. `UPDATE … WHERE id = ? AND payment_status = 'unpaid'`. Zero rows updated
   *    means someone else already paid it — a duplicate webhook, a webhook
   *    racing the return page, a replay. The caller gets `changed: false` and
   *    every side effect below is skipped. No lock, no read-then-write, no race.
   * 2. The amount the gateway reports is compared against what we recorded. A
   *    mismatch does not settle the order; it is flagged for a human. Trusting
   *    the gateway's figure blindly would make a tampered or misconfigured
   *    session able to pay a £500 order with £5.
   *
   * The return page must never call anything but this, and must never pass an
   * amount taken from its own query string — only evidence fetched from the
   * gateway using an id we stored ourselves.
   */
  async markOrderPaid(
    orderId: string,
    evidence: MarkPaidEvidence,
    actor: OrderActor = { type: 'system' }
  ): Promise<MarkPaidResult> {
    const order = await Order.query().where('id', orderId).first()
    if (!order) {
      throw publicError.notFound('Order not found.', 'order_not_found')
    }

    /**
     * Check the amount *before* opening a transaction.
     *
     * Nothing here needs to be atomic — it is a comparison against a row we
     * have already read — and doing it outside means the audit write below
     * happens on the default connection with no transaction open. Auditing from
     * inside a write transaction deadlocks on SQLite, where the driver holds a
     * single connection: the transaction waits on a query that is waiting on
     * the transaction.
     */
    if (
      evidence.currency.toUpperCase() !== order.currency.toUpperCase() ||
      evidence.amount !== order.totalAmount
    ) {
      await db.transaction(async (trx) => {
        await this.recordEvent(
          trx,
          order,
          'payment.amount_mismatch',
          {
            message: `Gateway reported ${evidence.amount} ${evidence.currency}, order expects ${order.totalAmount} ${order.currency}.`,
            meta: { evidence: { ...evidence, raw: undefined } },
          },
          actor
        )
      })

      await audit.record({
        actor: this.toAuditActor(actor),
        action: 'order.payment_amount_mismatch',
        subjectType: 'order',
        subjectId: order.id,
        amount: evidence.amount,
        currency: evidence.currency,
        changes: {
          expectedAmount: order.totalAmount,
          expectedCurrency: order.currency,
          gatewayPaymentId: evidence.gatewayPaymentId,
        },
      })

      throw publicError.unprocessable(
        'The amount collected does not match this order.',
        'payment_amount_mismatch'
      )
    }

    const changed = await db.transaction(async (trx) => {
      /**
       * The atomic claim. Everything after this line runs exactly once per
       * order, no matter how many callers arrive at the same moment: a
       * duplicate webhook, a webhook racing the return page, a replay.
       */
      const claimed = await trx
        .from('ecommerce_orders')
        .where('id', order.id)
        .where('payment_status', 'unpaid')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          paid_at: DateTime.now().toSQL(),
          reservation_expires_at: null,
          updated_at: DateTime.now().toSQL(),
        })

      if (Number(claimed) === 0) {
        // Already paid. Not an error — the expected outcome of a duplicate.
        return false
      }

      const items = await OrderItem.query({ client: trx }).where('order_id', order.id)

      /**
       * A downloads-only order fulfils itself the moment it is paid.
       *
       * Nobody ships it — `markShipped` is never called — so without this it
       * sits in the operator's work queue forever, asking to be posted. The
       * download grants issued a few lines below *are* the fulfilment.
       */
      const digitalOnly = items.length > 0 && items.every((item) => item.productType === 'digital')
      if (digitalOnly) {
        const now = DateTime.now()
        /**
         * `fulfilled_at` is set alongside the status, not left null. It is what
         * the refund-window sweep measures from, so an order without it never
         * matures and would sit in `fulfilled` forever — the same dead end this
         * block exists to close, moved one step along.
         */
        await trx.from('ecommerce_orders').where('id', order.id).update({
          fulfillment_status: 'fulfilled',
          status: 'fulfilled',
          fulfilled_at: now.toSQL(),
          updated_at: now.toSQL(),
        })
      }

      /**
       * Commit the reservation: the units leave both counters now that money
       * has changed hands. Doing this at payment rather than at shipment stops
       * the expiry sweep from releasing stock that has already been sold.
       */
      await inventory.commit(
        items
          .filter((item) => item.variantId)
          .map((item) => ({ variantId: item.variantId!, quantity: item.quantity })),
        trx
      )

      await trx
        .from('ecommerce_payments')
        .where('gateway_payment_id', evidence.gatewayPaymentId)
        .update({
          status: 'captured',
          captured_at: DateTime.now().toSQL(),
          updated_at: DateTime.now().toSQL(),
        })

      if (order.accountId) {
        await trx
          .from('ecommerce_accounts')
          .where('id', order.accountId)
          .increment('orders_count', 1)
        await trx
          .from('ecommerce_accounts')
          .where('id', order.accountId)
          .increment('total_spent_amount', order.totalAmount)
      }

      /**
       * Affiliate commission, if the order carried a referral code.
       *
       * Inside the same transaction as the payment claim, so it runs exactly
       * once per order — and `ecommerce_commissions.order_id` is unique as a
       * second guard, so even a bug here cannot pay twice for one sale.
       */
      const { default: AffiliateService } =
        await import('#modules/ecommerce/services/affiliate_service')
      await new AffiliateService().recordForOrder(order, trx)

      /**
       * Download grants for any digital lines, in the same transaction and for
       * the same reason: payment is the single moment that confers access, so
       * issuing here means a replayed webhook cannot mint a second set of
       * tokens for one purchase.
       */
      const { default: DigitalDeliveryService } =
        await import('#modules/ecommerce/services/digital_delivery_service')
      await new DigitalDeliveryService().grantForOrder(order, trx)

      await this.recordEvent(
        trx,
        order,
        'order.paid',
        {
          fromStatus: order.status,
          toStatus: 'confirmed',
          message: `Paid via ${evidence.source}.`,
          meta: { gatewayPaymentId: evidence.gatewayPaymentId, source: evidence.source },
        },
        actor
      )

      return true
    })

    if (!changed) {
      return { changed: false, order }
    }

    // After the commit: an audit write must never be able to roll back the
    // payment it is describing.
    await audit.record({
      actor: this.toAuditActor(actor),
      action: 'order.paid',
      subjectType: 'order',
      subjectId: order.id,
      amount: order.totalAmount,
      currency: order.currency,
      changes: { gatewayPaymentId: evidence.gatewayPaymentId, source: evidence.source },
    })

    /**
     * The receipt.
     *
     * After the commit, and behind a service that never throws — rule 5 applies
     * directly here. An order that has been paid is paid whether or not its
     * email went out, and letting a dead SMTP relay raise from this point would
     * make the gateway retry a payment we have already taken.
     *
     * It sits inside `if (changed)` for free: a duplicate webhook returns early
     * above, so one order sends one receipt however many deliveries arrive.
     */
    const { default: OrderNotifierService } =
      await import('#modules/ecommerce/services/order_notifier_service')
    await new OrderNotifierService().sendOrderConfirmation(order.id)

    await order.refresh()
    return { changed: true, order }
  }

  /**
   * Close out orders that have been delivered and are past the refund window.
   *
   * Without this, `completed` is unreachable: nothing drives it but an operator
   * choosing it by hand from a dropdown, so every shipped order sits in the
   * open list forever and the status exists only on paper.
   *
   * The refund window is the right boundary — until it passes, the sale can
   * still be reversed, so it is not finished.
   */
  async completeMatured(now: DateTime = DateTime.now()): Promise<number> {
    const { default: StoreSettingsService } = await import(
      '#modules/ecommerce/services/settings_service'
    )
    const store = await new StoreSettingsService().getOrCreate()
    const cutoff = now.minus({ days: store.refundWindowDays })

    const matured = await Order.query()
      .where('status', 'fulfilled')
      .whereIn('payment_status', ['paid', 'partially_refunded'])
      .whereNotNull('fulfilled_at')
      .where('fulfilled_at', '<=', cutoff.toSQL()!)
      .limit(200)

    let completed = 0

    for (const order of matured) {
      /**
       * Guarded on the status it was read with, so an order cancelled or
       * refunded a moment ago is not dragged into `completed` by this sweep.
       */
      const claimed = await db
        .from('ecommerce_orders')
        .where('id', order.id)
        .where('status', 'fulfilled')
        .whereIn('payment_status', ['paid', 'partially_refunded'])
        .update({ status: 'completed', updated_at: now.toSQL() })

      if (Number(claimed) === 0) continue

      await db.transaction(async (trx) => {
        await this.recordEvent(
          trx,
          order,
          'order.completed',
          {
            fromStatus: 'fulfilled',
            toStatus: 'completed',
            message: 'Refund window passed.',
          },
          { type: 'system' }
        )
      })

      completed++
    }

    return completed
  }

  /**
   * Release an unpaid order's stock once its window has passed.
   *
   * Guarded the same way as payment: the WHERE clause requires the order to
   * still be unpaid and still reserving, so an order that was paid a
   * millisecond before the sweep ran is left alone.
   */
  async expireStaleOrders(now: DateTime = DateTime.now()): Promise<number> {
    const stale = await Order.query()
      .where('payment_status', 'unpaid')
      .whereIn('status', ['draft', 'pending'])
      .whereNotNull('reservation_expires_at')
      .where('reservation_expires_at', '<', now.toSQL()!)
      .limit(200)

    let expired = 0

    for (const order of stale) {
      const done = await db.transaction(async (trx) => {
        const claimed = await trx
          .from('ecommerce_orders')
          .where('id', order.id)
          .where('payment_status', 'unpaid')
          .whereIn('status', ['draft', 'pending'])
          .update({
            status: 'cancelled',
            cancelled_at: now.toSQL(),
            reservation_expires_at: null,
            updated_at: now.toSQL(),
          })

        if (Number(claimed) === 0) return false

        const items = await OrderItem.query({ client: trx }).where('order_id', order.id)
        await inventory.release(
          items
            .filter((item) => item.variantId)
            .map((item) => ({ variantId: item.variantId!, quantity: item.quantity })),
          trx
        )

        /**
         * Give the discount use back. An abandoned checkout that permanently
         * consumed a limited code would let anyone burn a promotion down to
         * zero without buying anything.
         */
        const { default: DiscountService } =
          await import('#modules/ecommerce/services/discount_service')
        await new DiscountService().release(order.id, trx)

        await this.recordEvent(
          trx,
          order,
          'order.expired',
          {
            fromStatus: order.status,
            toStatus: 'cancelled',
            message: 'Checkout window elapsed; reserved stock released.',
          },
          { type: 'system' }
        )

        return true
      })

      if (done) expired++
    }

    return expired
  }

  /** Cancel an order and put back whatever it was holding. */
  async cancel(orderId: string, reason: string | null, actor: OrderActor): Promise<Order> {
    const order = await Order.query().where('id', orderId).first()
    if (!order) throw publicError.notFound('Order not found.', 'order_not_found')

    assertOrderTransition(order.status, 'cancelled')
    const wasPaid = order.isPaid
    const from = order.status

    await db.transaction(async (trx) => {
      const items = await OrderItem.query({ client: trx }).where('order_id', order.id)
      const lines = items
        .filter((item) => item.variantId)
        .map((item) => ({ variantId: item.variantId!, quantity: item.quantity }))

      /**
       * A paid order's stock was already committed off the shelf, so cancelling
       * it puts units back. An unpaid one only ever held a reservation, so that
       * is what gets released. Getting this backwards is how phantom stock
       * appears.
       */
      if (wasPaid) {
        await inventory.restock(lines, trx)
      } else {
        await inventory.release(lines, trx)
      }

      order.useTransaction(trx)
      order.status = 'cancelled'
      order.cancelledAt = DateTime.now()
      order.reservationExpiresAt = null
      await order.save()

      await this.recordEvent(
        trx,
        order,
        'order.cancelled',
        { fromStatus: from, toStatus: 'cancelled', message: reason },
        actor
      )
    })

    // Audited after the commit — see `markOrderPaid`.
    await audit.record({
      actor: this.toAuditActor(actor),
      action: 'order.cancelled',
      subjectType: 'order',
      subjectId: order.id,
      amount: order.totalAmount,
      currency: order.currency,
      changes: { reason, wasPaid },
    })

    return order
  }

  /** Move fulfilment forward. Does not touch money. */
  /**
   * Record that an order shipped, and tell the buyer.
   *
   * Separate from `setStatus` because it carries information the buyer needs,
   * not just a state change: marking an order `fulfilled` with no carrier and
   * no tracking number leaves them exactly as informed as before.
   *
   * Sets `fulfillment_status` and the status in one place, so "shipped" cannot
   * mean one thing on the order list and another on its detail page.
   */
  async markShipped(
    orderId: string,
    shipment: { carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null },
    actor: OrderActor
  ): Promise<Order> {
    const order = await Order.findOrFail(orderId)

    if (!order.isPaid) {
      throw publicError.unprocessable(
        'This order has not been paid, so it should not be shipped yet.',
        'order_not_paid'
      )
    }

    const carrier = shipment.carrier?.trim() || null
    const trackingNumber = shipment.trackingNumber?.trim() || null
    const trackingUrl = shipment.trackingUrl?.trim() || null

    /**
     * A tracking URL is taken from the operator rather than built from a
     * carrier name. Guessing one produces a link that 404s for the buyer, and
     * only `http(s)` is accepted — a `javascript:` URL would end up in an email
     * and on their order page.
     */
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl)) {
      throw publicError.unprocessable(
        'A tracking link must start with http:// or https://.',
        'invalid_tracking_url'
      )
    }

    const alreadyShipped = Boolean(order.shippedAt)

    order.carrier = carrier
    order.trackingNumber = trackingNumber
    order.trackingUrl = trackingUrl
    order.fulfillmentStatus = 'fulfilled'
    if (!alreadyShipped) order.shippedAt = DateTime.now()
    if (order.status === 'confirmed') {
      order.status = 'fulfilled'
      order.fulfilledAt = DateTime.now()
    }
    await order.save()

    await db.transaction(async (trx) => {
      await this.recordEvent(
        trx,
        order,
        alreadyShipped ? 'order.shipment_updated' : 'order.shipped',
        {
          toStatus: order.status,
          message: carrier ? `Shipped with ${carrier}.` : 'Marked as shipped.',
          meta: { carrier, trackingNumber, hasTrackingUrl: Boolean(trackingUrl) },
        },
        actor
      )
    })

    await audit.record({
      actor: this.toAuditActor(actor),
      action: alreadyShipped ? 'order.shipment_updated' : 'order.shipped',
      subjectType: 'order',
      subjectId: order.id,
      changes: { carrier, trackingNumber },
    })

    /**
     * The notification, only the first time. Re-saving a corrected tracking
     * number must not send a second "your order has shipped" — and, like the
     * receipt, this can never fail the operation that triggered it.
     */
    if (!alreadyShipped) {
      const { default: OrderNotifierService } = await import(
        '#modules/ecommerce/services/order_notifier_service'
      )
      await new OrderNotifierService().sendShipmentNotice(order.id)
    }

    return order
  }

  async setStatus(orderId: string, to: OrderStatus, actor: OrderActor): Promise<Order> {
    const order = await Order.findOrFail(orderId)
    assertOrderTransition(order.status, to)

    const from = order.status
    order.status = to
    if (to === 'fulfilled') order.fulfilledAt = DateTime.now()
    await order.save()

    await db.transaction(async (trx) => {
      await this.recordEvent(
        trx,
        order,
        'order.status_changed',
        { fromStatus: from, toStatus: to },
        actor
      )
    })

    await audit.record({
      actor: this.toAuditActor(actor),
      action: 'order.status_changed',
      subjectType: 'order',
      subjectId: order.id,
      changes: { from, to },
    })

    return order
  }

  /**
   * Generate the next human-facing order number.
   *
   * `prefix` is passed in rather than read here, deliberately: every query in
   * this method must go through `trx`. Reading settings on the default
   * connection while a write transaction is open deadlocks on SQLite, where the
   * driver is a single synchronous connection holding the write lock — the
   * transaction waits for a read that is waiting for the transaction.
   */
  async nextOrderNumber(trx: TransactionClientContract, prefix = 'ORD-'): Promise<string> {
    /**
     * Sequence derived from the row count, then made collision-proof by the
     * unique index on `number`: if two checkouts land on the same value, one
     * insert fails and the caller retries. A read-then-write "max + 1" alone
     * would be a race, and order numbers are quoted to customers and processors.
     */
    const row = await trx.from('ecommerce_orders').count('* as total').first()
    const sequence = Number((row as { total?: string | number } | undefined)?.total ?? 0) + 1

    return `${prefix}${String(sequence).padStart(5, '0')}`
  }

  /** Append to the order's own timeline. */
  async recordEvent(
    trx: TransactionClientContract,
    order: Order,
    type: string,
    details: {
      fromStatus?: string | null
      toStatus?: string | null
      message?: string | null
      meta?: Record<string, unknown>
    },
    actor: OrderActor
  ): Promise<void> {
    await OrderEvent.create(
      {
        id: newUlid(),
        orderId: order.id,
        type,
        fromStatus: details.fromStatus ?? null,
        toStatus: details.toStatus ?? null,
        message: details.message ?? null,
        meta: details.meta ?? {},
        actorType: actor.type,
        actorId: actor.id ?? null,
        actorLabel: actor.label ?? null,
      },
      { client: trx }
    )
  }

  /** Bridge the order actor shape onto the audit log's. */
  private toAuditActor(actor: OrderActor) {
    switch (actor.type) {
      case 'user':
        // The audit service wants the user model; only id and email are read.
        return {
          type: 'user' as const,
          user: { id: Number(actor.id ?? 0), email: actor.label ?? 'unknown' },
        }
      case 'customer':
        return { type: 'customer' as const, id: String(actor.id ?? ''), label: actor.label }
      case 'worker':
        return { type: 'worker' as const, label: actor.label }
      default:
        return { type: 'system' as const, label: actor.label }
    }
  }
}

export { Payment }
