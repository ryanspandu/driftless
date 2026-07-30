import type { FulfillmentStatus, OrderStatus, PaymentStatus } from '#modules/ecommerce/models/order'
import { publicError } from '#exceptions/public_error'

/**
 * Which transitions are legal.
 *
 * Written out as data rather than scattered `if` statements so the whole set of
 * legal moves is visible in one place and can be asserted against in tests. An
 * illegal transition throws — silently allowing one is how an order ends up
 * `cancelled` and `fulfilled` at the same time.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // Created but not yet handed to a gateway.
  draft: ['pending', 'cancelled'],
  // Buyer is at the gateway, stock is reserved.
  pending: ['confirmed', 'cancelled'],
  // Paid. Fulfilment can begin.
  confirmed: ['fulfilled', 'cancelled'],
  fulfilled: ['completed', 'cancelled'],
  // Terminal.
  completed: [],
  cancelled: [],
}

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ['authorized', 'paid', 'failed'],
  authorized: ['paid', 'failed'],
  paid: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  // Terminal: a refunded payment cannot become paid again. A new payment on the
  // same order would be a new payment record.
  refunded: [],
  // A failed attempt does not close the order — the buyer may try again.
  failed: ['unpaid', 'authorized', 'paid'],
}

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  unfulfilled: ['partially_fulfilled', 'fulfilled'],
  partially_fulfilled: ['partially_fulfilled', 'fulfilled', 'unfulfilled'],
  fulfilled: ['partially_fulfilled', 'unfulfilled'],
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ORDER_TRANSITIONS[from].includes(to)
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || PAYMENT_TRANSITIONS[from].includes(to)
}

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return from === to || FULFILLMENT_TRANSITIONS[from].includes(to)
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw publicError.unprocessable(
      `An order cannot go from ${from} to ${to}.`,
      'illegal_order_transition'
    )
  }
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw publicError.unprocessable(
      `Payment cannot go from ${from} to ${to}.`,
      'illegal_payment_transition'
    )
  }
}

export function assertFulfillmentTransition(from: FulfillmentStatus, to: FulfillmentStatus): void {
  if (!canTransitionFulfillment(from, to)) {
    throw publicError.unprocessable(
      `Fulfilment cannot go from ${from} to ${to}.`,
      'illegal_fulfillment_transition'
    )
  }
}

/** Statuses that mean money was taken and has not been fully returned. */
export const PAID_STATUSES: PaymentStatus[] = ['paid', 'partially_refunded']

/** Statuses in which an order still holds a stock reservation. */
export const RESERVING_STATUSES: OrderStatus[] = ['draft', 'pending']

/**
 * The bucket an order sits in from the operator's point of view.
 *
 * Derived, never stored. The three underlying axes — payment, fulfilment and
 * the order's own status — are each correct on their own, but none of them
 * answers the question someone actually opens this screen with: *what do I need
 * to do?* Storing a fourth column would give that answer a way to disagree with
 * the three it is computed from.
 *
 * - `action`   — money is in, goods are not out. **This is the work queue.**
 * - `open`     — live, but nothing to do: awaiting payment, or already shipped
 *                and waiting out the refund window.
 * - `closed`   — finished, cancelled, refunded or failed. Nothing more happens.
 */
export type OrderStage = 'action' | 'open' | 'closed'

export function stageOf(order: {
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
}): OrderStage {
  /**
   * Closed wins first, and deliberately so: a refunded order that was never
   * shipped is finished, not outstanding work. Checking `action` first would
   * put it in the queue forever.
   */
  if (order.status === 'completed' || order.status === 'cancelled') return 'closed'
  if (order.paymentStatus === 'refunded' || order.paymentStatus === 'failed') return 'closed'

  if (PAID_STATUSES.includes(order.paymentStatus) && order.fulfillmentStatus !== 'fulfilled') {
    return 'action'
  }

  return 'open'
}
