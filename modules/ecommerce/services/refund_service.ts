import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import AuditLogService from '#services/audit_log_service'
import Order from '#modules/ecommerce/models/order'
import OrderItem from '#modules/ecommerce/models/order_item'
import Payment from '#modules/ecommerce/models/payment'
import Refund from '#modules/ecommerce/models/refund'
import InventoryService from '#modules/ecommerce/services/inventory_service'
import OrderService, { type OrderActor } from '#modules/ecommerce/services/order_service'
import { gatewayDriver } from '#modules/ecommerce/services/gateways/registry'
import type { RefundResult } from '#modules/ecommerce/services/gateways/types'

const inventory = new InventoryService()
const orders = new OrderService()
const audit = new AuditLogService()

export interface RefundRequest {
  orderId: string
  /** Minor units. Must not exceed what is left refundable. */
  amount: number
  reason?: string | null
  /** Put the units back on the shelf. Usually yes for a returned item. */
  restock?: boolean
}

export default class RefundService {
  /**
   * Refund part or all of an order.
   *
   * The ceiling is enforced by a **conditional UPDATE**, not by reading the
   * order and checking in JavaScript:
   *
   * ```sql
   * UPDATE … SET refunded_amount = refunded_amount + ?
   * WHERE id = ? AND refunded_amount + ? <= total_amount
   * ```
   *
   * Zero rows means the ceiling would have been breached — by this request or
   * by one that landed a millisecond earlier. Two support agents refunding the
   * same order at the same moment cannot between them return more than was
   * taken, which a read-then-check would happily allow.
   *
   * The gateway call happens **after** the ceiling is claimed and before the
   * transaction commits: if the gateway refuses, everything rolls back and the
   * order's refunded total is untouched.
   */
  async refund(request: RefundRequest, actor: OrderActor): Promise<Refund> {
    const { orderId, amount } = request

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw publicError.unprocessable(
        'A refund must be a positive whole number of minor units.',
        'invalid_refund_amount'
      )
    }

    const order = await Order.query().where('id', orderId).first()
    if (!order) throw publicError.notFound('Order not found.', 'order_not_found')

    if (!order.isPaid) {
      throw publicError.unprocessable(
        'This order has not been paid, so there is nothing to refund.',
        'order_not_paid'
      )
    }

    const payment = await Payment.query()
      .where('order_id', order.id)
      .where('status', 'captured')
      .orderBy('created_at', 'desc')
      .first()

    if (!payment) {
      throw publicError.unprocessable(
        'No captured payment was found for this order.',
        'no_captured_payment'
      )
    }

    /**
     * A stable key for this attempt, so a retry at the gateway returns the
     * original refund rather than issuing a second one. Derived from the order
     * and the running total, so a genuine second refund of the same amount gets
     * a different key.
     */
    const idempotencyKey = `refund_${order.id}_${order.refundedAmount}_${amount}`

    const refund = await db.transaction(async (trx) => {
      // Claim the headroom first. This is the ceiling.
      const claimed = await trx
        .from('ecommerce_orders')
        .where('id', order.id)
        .whereRaw('refunded_amount + ? <= total_amount', [amount])
        .increment('refunded_amount', amount)

      if (Number(claimed) === 0) {
        throw publicError.unprocessable(
          `This order has ${order.refundableAmount} left to refund.`,
          'refund_exceeds_total'
        )
      }

      /**
       * A manual payment is refunded manually.
       *
       * There is no gateway holding the money, so the only honest thing this
       * can do is record that a refund happened and let the operator move the
       * cash. Everything downstream — the ceiling, the restock, the voided
       * commission, the revoked downloads — is identical, which is the point of
       * routing it through the same method rather than a parallel one.
       */
      const result: RefundResult =
        payment.gateway === 'manual'
          ? {
              gatewayRefundId: `manual_${newUlid()}`,
              // Recorded as succeeded because the decision has been made; the
              // cash movement itself is outside this system either way.
              status: 'succeeded',
              raw: { manual: true },
            }
          : await (
              await gatewayDriver(payment.gateway)
            ).refund({
              gatewayPaymentId: payment.gatewayPaymentId,
              amount,
              currency: order.currency,
              reason: request.reason ?? null,
              idempotencyKey,
            })

      const row = await Refund.create(
        {
          id: newUlid(),
          orderId: order.id,
          paymentId: payment.id,
          amount,
          currency: order.currency,
          reason: request.reason ?? null,
          status: result.status,
          gatewayRefundId: result.gatewayRefundId,
          gatewayPayload: result.raw,
          createdByUserId: actor.type === 'user' ? Number(actor.id ?? 0) || null : null,
        },
        { client: trx }
      )

      // Re-read the running total so the status reflects this refund.
      const updated = await trx
        .from('ecommerce_orders')
        .where('id', order.id)
        .select('refunded_amount', 'total_amount')
        .first()

      const refundedTotal = Number(updated?.refunded_amount ?? 0)
      const fullyRefunded = refundedTotal >= Number(updated?.total_amount ?? 0)

      await trx
        .from('ecommerce_orders')
        .where('id', order.id)
        .update({
          payment_status: fullyRefunded ? 'refunded' : 'partially_refunded',
          updated_at: DateTime.now().toSQL(),
        })

      if (request.restock !== false) {
        const items = await OrderItem.query({ client: trx }).where('order_id', order.id)
        /**
         * Restock proportionally only on a full refund. Partial refunds are
         * usually a price adjustment rather than a returned item, and guessing
         * which units came back would create phantom stock.
         */
        if (fullyRefunded) {
          await inventory.restock(
            items
              .filter((item) => item.variantId)
              .map((item) => ({ variantId: item.variantId!, quantity: item.quantity })),
            trx
          )
        }
      }

      /**
       * Void any affiliate commission. The sale was reversed, so the referral
       * fee goes with it — otherwise a refund cycle becomes a way to extract
       * commission on sales that never stood.
       */
      await trx
        .from('ecommerce_commissions')
        .where('order_id', order.id)
        .whereIn('status', ['pending', 'approved'])
        .update({
          status: 'void',
          void_reason: fullyRefunded ? 'Order refunded' : 'Order partially refunded',
          updated_at: DateTime.now().toSQL(),
        })

      /**
       * A fully refunded order keeps nothing it bought, downloads included.
       *
       * Partial refunds deliberately leave grants alone: those are usually a
       * price adjustment on an order the buyer still has, and withdrawing the
       * file over a discount would be a worse bug than the one this prevents.
       */
      if (fullyRefunded) {
        const { default: DigitalDeliveryService } =
          await import('#modules/ecommerce/services/digital_delivery_service')
        await new DigitalDeliveryService().revokeForOrder(order.id, trx)
      }

      await orders.recordEvent(
        trx,
        order,
        'order.refunded',
        {
          message: `Refunded ${amount} ${order.currency}.`,
          meta: {
            amount,
            reason: request.reason,
            gatewayRefundId: result.gatewayRefundId,
            fullyRefunded,
          },
        },
        actor
      )

      return row
    })

    /**
     * Audited after the commit. `AuditLogService` writes on the default
     * connection, and issuing that from inside an open write transaction
     * deadlocks on SQLite — and an audit write must never be able to roll back
     * the refund it describes.
     */
    await audit.record({
      actor:
        actor.type === 'user'
          ? { type: 'user', user: { id: Number(actor.id ?? 0), email: actor.label ?? 'unknown' } }
          : { type: 'system', label: actor.label },
      action: 'order.refunded',
      subjectType: 'order',
      subjectId: order.id,
      amount,
      currency: order.currency,
      changes: {
        reason: request.reason,
        gatewayRefundId: refund.gatewayRefundId,
        restock: request.restock !== false,
      },
    })

    return refund
  }
}
