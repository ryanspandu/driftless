import Order from '#modules/ecommerce/models/order'
import type {
  AddressSnapshot,
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '#modules/ecommerce/models/order'
import OrderItem from '#modules/ecommerce/models/order_item'
import OrderEvent from '#modules/ecommerce/models/order_event'
import Payment from '#modules/ecommerce/models/payment'
import Refund from '#modules/ecommerce/models/refund'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { PAID_STATUSES, stageOf, type OrderStage } from '#modules/ecommerce/services/order_state_machine'
import { publicError } from '#exceptions/public_error'

/**
 * Read models for the order screens.
 *
 * Separate from `OrderService`, which owns state transitions. This file only
 * reads, and the split keeps the transition logic from accumulating
 * presentation concerns.
 *
 * These are **admin** DTOs and include staff-only fields (`internalNote`, cost
 * data on refunds). The storefront builds its own, narrower shapes rather than
 * filtering these — omission by construction beats remembering to strip.
 */

export interface OrderItemDto {
  id: string
  title: string
  variantTitle: string | null
  sku: string | null
  imageUrl: string | null
  productType: 'physical' | 'digital'
  quantity: number
  refundedQuantity: number
  unit: MoneyDto
  subtotal: MoneyDto
  discount: MoneyDto
  tax: MoneyDto
  total: MoneyDto
}

export interface OrderEventDto {
  id: string
  type: string
  fromStatus: string | null
  toStatus: string | null
  message: string | null
  actorType: string
  actorLabel: string | null
  createdAt: string
}

export interface PaymentDto {
  id: string
  gateway: string
  mode: string
  status: string
  amount: MoneyDto
  gatewayPaymentId: string
  capturedAt: string | null
  failureMessage: string | null
}

export interface RefundDto {
  id: string
  amount: MoneyDto
  reason: string | null
  status: string
  createdAt: string
}

export interface OrderListItemDto {
  id: string
  number: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  stage: OrderStage
  email: string
  customerId: string | null
  total: MoneyDto
  refunded: MoneyDto
  itemCount: number
  createdAt: string
  paidAt: string | null
}

export interface OrderDetailDto extends OrderListItemDto {
  subtotal: MoneyDto
  discount: MoneyDto
  shipping: MoneyDto
  tax: MoneyDto
  refundable: MoneyDto
  shippingAddress: AddressSnapshot
  billingAddress: AddressSnapshot
  discountCode: string | null
  affiliateCode: string | null
  shippingMethodLabel: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  customerNote: string | null
  /** Staff-only. */
  internalNote: string | null
  reservationExpiresAt: string | null
  items: OrderItemDto[]
  events: OrderEventDto[]
  payments: PaymentDto[]
  refunds: RefundDto[]
}

export interface OrderListQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: OrderStatus | 'all'
  paymentStatus?: PaymentStatus | 'all'
  /** The operator-facing bucket — see `stageOf`. */
  stage?: OrderStage | 'all'
}

const settings = new StoreSettingsService()

export default class OrderQueryService {
  async list(query: OrderListQuery): Promise<{
    items: OrderListItemDto[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(query.page ?? 1, 1)
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100)
    const locale = (await settings.getOrCreate()).locale

    const builder = Order.query().whereNull('deleted_at')

    if (query.status && query.status !== 'all') builder.where('status', query.status)

    /**
     * The stage filter, expressed in SQL rather than by loading rows and
     * calling `stageOf` on them — a list that filtered in JavaScript would
     * paginate the wrong set, showing "20 of 340" and then five rows.
     *
     * Each branch mirrors `stageOf` exactly. They must be changed together,
     * which is why the reasoning lives there and only the translation lives
     * here.
     */
    if (query.stage && query.stage !== 'all') {
      const closed = (q: typeof builder) =>
        q.whereIn('status', ['completed', 'cancelled']).orWhereIn('payment_status', [
          'refunded',
          'failed',
        ])

      if (query.stage === 'closed') {
        builder.where((q) => closed(q as typeof builder))
      } else {
        // Everything not closed, then split on whether the goods have gone out.
        builder.whereNot((q) => closed(q as typeof builder))

        if (query.stage === 'action') {
          builder
            .whereIn('payment_status', PAID_STATUSES)
            .whereNot('fulfillment_status', 'fulfilled')
        } else {
          builder.where((q) =>
            q
              .whereNotIn('payment_status', PAID_STATUSES)
              .orWhere('fulfillment_status', 'fulfilled')
          )
        }
      }
    }
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      builder.where('payment_status', query.paymentStatus)
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`
      builder.where((q) => {
        q.whereRaw('LOWER(number) LIKE ?', [term]).orWhereRaw('LOWER(email) LIKE ?', [term])
      })
    }

    const result = await builder
      .preload('items')
      .orderBy('created_at', 'desc')
      .paginate(page, pageSize)

    return {
      items: result.all().map((order) => this.toListItem(order, locale)),
      total: result.total,
      page,
      pageSize,
    }
  }

  async find(id: string): Promise<OrderDetailDto> {
    const order = await Order.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('items')
      .first()

    if (!order) throw publicError.notFound('Order not found.', 'order_not_found')

    const locale = (await settings.getOrCreate()).locale

    const [events, payments, refunds] = await Promise.all([
      OrderEvent.query().where('order_id', order.id).orderBy('created_at', 'desc'),
      Payment.query().where('order_id', order.id).orderBy('created_at', 'desc'),
      Refund.query().where('order_id', order.id).orderBy('created_at', 'desc'),
    ])

    const money = (amount: number) => Money.toDto(amount, order.currency, locale)

    return {
      ...this.toListItem(order, locale),
      subtotal: money(order.subtotalAmount),
      discount: money(order.discountAmount),
      shipping: money(order.shippingAmount),
      tax: money(order.taxAmount),
      refundable: money(order.refundableAmount),
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      discountCode: order.discountCode,
      affiliateCode: order.affiliateCode,
      shippingMethodLabel: order.shippingMethodLabel,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      shippedAt: order.shippedAt?.toISO() ?? null,
      customerNote: order.customerNote,
      internalNote: order.internalNote,
      reservationExpiresAt: order.reservationExpiresAt?.toISO() ?? null,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        imageUrl: item.imageUrl,
        productType: item.productType,
        quantity: item.quantity,
        refundedQuantity: item.refundedQuantity,
        unit: money(item.unitAmount),
        subtotal: money(item.subtotalAmount),
        discount: money(item.discountAmount),
        tax: money(item.taxAmount),
        total: money(item.totalAmount),
      })),
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        message: event.message,
        actorType: event.actorType,
        actorLabel: event.actorLabel,
        createdAt: event.createdAt.toISO()!,
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        gateway: payment.gateway,
        mode: payment.mode,
        status: payment.status,
        amount: money(payment.amount),
        gatewayPaymentId: payment.gatewayPaymentId,
        capturedAt: payment.capturedAt?.toISO() ?? null,
        failureMessage: payment.failureMessage,
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: money(refund.amount),
        reason: refund.reason,
        status: refund.status,
        createdAt: refund.createdAt.toISO()!,
      })),
    }
  }

  private toListItem(order: Order, locale: string): OrderListItemDto {
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      // Derived here so the row badge and the tab filter cannot disagree.
      stage: stageOf(order),
      email: order.email,
      customerId: order.customerId,
      total: Money.toDto(order.totalAmount, order.currency, locale),
      refunded: Money.toDto(order.refundedAmount, order.currency, locale),
      itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
      createdAt: order.createdAt.toISO()!,
      paidAt: order.paidAt?.toISO() ?? null,
    }
  }
}

export { OrderItem }
