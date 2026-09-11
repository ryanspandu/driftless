import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { renderPage } from '#helpers/inertia_render'
import { apiFail } from '#helpers/api_error_response'
import type User from '#models/user'
import Order from '#modules/ecommerce/models/order'
import OrderQueryService from '#modules/ecommerce/services/order_query_service'
import OrderService, { type OrderActor } from '#modules/ecommerce/services/order_service'
import RefundService from '#modules/ecommerce/services/refund_service'
import ManualOrderService from '#modules/ecommerce/services/manual_order_service'
import AuditLogService from '#services/audit_log_service'
import { countryCode } from '#modules/ecommerce/validators/country'

const refundValidator = vine.compile(
  vine.object({
    /**
     * Minor units, integer. The admin UI's `MoneyInput` produces this; a
     * decimal here would mean something is doing float money arithmetic.
     */
    amount: vine.number().min(1).withoutDecimals(),
    reason: vine.string().trim().maxLength(255).nullable().optional(),
    restock: vine.boolean().optional(),
  })
)

const addressSchema = vine.object({
  firstName: vine.string().trim().maxLength(80).nullable().optional(),
  lastName: vine.string().trim().maxLength(80).nullable().optional(),
  company: vine.string().trim().maxLength(120).nullable().optional(),
  line1: vine.string().trim().minLength(1).maxLength(200),
  line2: vine.string().trim().maxLength(200).nullable().optional(),
  city: vine.string().trim().minLength(1).maxLength(120),
  state: vine.string().trim().maxLength(120).nullable().optional(),
  postalCode: vine.string().trim().maxLength(32).nullable().optional(),
  // Same closed list the storefront checks against; a phone order gets no
  // latitude a web order would not, or the two disagree about what ships.
  country: vine.string().trim().use(countryCode()),
  phone: vine.string().trim().maxLength(32).nullable().optional(),
})

/**
 * A manual order.
 *
 * Note what staff may set that a buyer may not: `shippingAmount` and
 * `discountAmount`. Both are integers in minor units, both are bounded by the
 * service, and both are audited — a phone order is exactly the case where the
 * standard rate does not apply. What nobody can set, here or anywhere, is the
 * price of a product.
 */
const manualOrderValidator = vine.compile(
  vine.object({
    lines: vine
      .array(
        vine.object({
          variantId: vine.string().trim().minLength(1).maxLength(40),
          quantity: vine.number().min(1).max(999).withoutDecimals(),
        })
      )
      .minLength(1)
      .maxLength(100),
    email: vine.string().trim().email().maxLength(254),
    shippingAddress: addressSchema.optional(),
    billingAddress: addressSchema.optional(),
    customerNote: vine.string().trim().maxLength(1_000).nullable().optional(),
    internalNote: vine.string().trim().maxLength(2_000).nullable().optional(),
    shippingAmount: vine.number().min(0).withoutDecimals().optional(),
    discountAmount: vine.number().min(0).withoutDecimals().optional(),
    markPaid: vine.boolean().optional(),
    paymentReference: vine.string().trim().maxLength(255).nullable().optional(),
  })
)

const shipmentValidator = vine.compile(
  vine.object({
    carrier: vine.string().trim().maxLength(80).nullable().optional(),
    trackingNumber: vine.string().trim().maxLength(120).nullable().optional(),
    /**
     * Taken from the operator, never built from a carrier name — a guessed URL
     * 404s for the buyer. The scheme is checked in the service, because a
     * `javascript:` link would end up in an email.
     */
    trackingUrl: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

const statusValidator = vine.compile(
  vine.object({
    status: vine.enum(['confirmed', 'fulfilled', 'completed'] as const),
  })
)

const cancelValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().maxLength(255).nullable().optional(),
  })
)

const noteValidator = vine.compile(
  vine.object({
    internalNote: vine.string().trim().maxLength(5_000).nullable(),
  })
)

const query = new OrderQueryService()
const orders = new OrderService()
const refunds = new RefundService()
const manual = new ManualOrderService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/orders')

/** The signed-in admin, in the shape the order services expect. */
function actorFrom(auth: HttpContext['auth']): OrderActor {
  const user = auth.user as User
  return { type: 'user', id: String(user.id), label: user.email }
}

export default class OrdersController {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/orders/index', {})
  }

  async detailPage({ inertia, params }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/orders/detail', {
      orderId: String(params.id),
    })
  }

  /** The "create an order by hand" screen. */
  async newPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/orders/new', {})
  }

  /**
   * Create an order from the admin.
   *
   * Goes through the same pricing and inventory path as a storefront checkout —
   * it reserves stock, snapshots its lines, and if `markPaid` is set it reaches
   * paid through `markOrderPaid` like everything else. The access token comes
   * back once so the operator can send the buyer their order link.
   */
  async storeManual(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(manualOrderValidator)
      const result = await manual.create(payload, actorFrom(auth))

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'order.created_manually',
        subjectType: 'order',
        subjectId: result.orderId,
        amount: result.total.amount,
        currency: result.total.currency,
        /**
         * The operator-set amounts are the point of this entry: they are the
         * only numbers on the order a human chose rather than the catalogue.
         */
        changes: {
          number: result.orderNumber,
          shippingAmount: payload.shippingAmount ?? 0,
          discountAmount: payload.discountAmount ?? 0,
          markedPaid: Boolean(payload.markPaid),
          paymentReference: payload.paymentReference ?? null,
          lineCount: payload.lines.length,
        },
        ctx,
      })

      return response.status(201).json(result)
    } catch (error) {
      return fail(response, error)
    }
  }

  async index({ request, response }: HttpContext) {
    const result = await query.list({
      page: Number(request.input('page', 1)) || 1,
      pageSize: Number(request.input('pageSize', 20)) || 20,
      search: request.input('search') || undefined,
      status: request.input('status') || undefined,
      paymentStatus: request.input('paymentStatus') || undefined,
      stage: request.input('stage') || undefined,
    })
    return response.json(result)
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await query.find(String(params.id)))
    } catch (error) {
      return fail(response, error)
    }
  }

  /**
   * Issue a refund.
   *
   * Guarded by `ecommerce:orders:refund`, deliberately separate from
   * `orders:manage` — moving money out is a different job from updating a
   * fulfilment status.
   */
  async refund(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(refundValidator)
      const refund = await refunds.refund(
        {
          orderId: String(params.id),
          amount: payload.amount,
          reason: payload.reason ?? null,
          restock: payload.restock,
        },
        actorFrom(auth)
      )

      return response.status(201).json(await query.find(refund.orderId))
    } catch (error) {
      return fail(response, error)
    }
  }

  async updateStatus(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const { status } = await request.validateUsing(statusValidator)
      await orders.setStatus(String(params.id), status, actorFrom(auth))
      return response.json(await query.find(String(params.id)))
    } catch (error) {
      return fail(response, error)
    }
  }

  async cancel(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const { reason } = await request.validateUsing(cancelValidator)
      await orders.cancel(String(params.id), reason ?? null, actorFrom(auth))
      return response.json(await query.find(String(params.id)))
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Staff-only note. Never leaves the admin API. */
  async updateNote(ctx: HttpContext) {
    const { params, request, response } = ctx
    try {
      const { internalNote } = await request.validateUsing(noteValidator)
      const order = await Order.findOrFail(String(params.id))
      order.internalNote = internalNote
      await order.save()
      return response.json(await query.find(order.id))
    } catch (error) {
      return fail(response, error)
    }
  }

  /**
   * Record that an order shipped, and notify the buyer.
   *
   * Separate from `updateStatus` because it carries what the buyer actually
   * needs — a carrier and a tracking number. Marking an order fulfilled without
   * them leaves them no better informed than before.
   */
  async markShipped(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(shipmentValidator)
      await orders.markShipped(String(params.id), payload, actorFrom(auth))
      return response.json(await query.find(String(params.id)))
    } catch (error) {
      return fail(response, error)
    }
  }
}
