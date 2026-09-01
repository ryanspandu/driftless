import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { renderPage } from '#helpers/inertia_render'
import { apiFail } from '#helpers/api_error_response'
import { publicError } from '#exceptions/public_error'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import Customer from '#modules/ecommerce/models/customer'
import { Money } from '#modules/ecommerce/services/money'
import CustomerAuthService from '#modules/ecommerce/services/customer_auth_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const statusValidator = vine.compile(
  vine.object({
    status: vine.enum(['active', 'blocked'] as const),
  })
)

const createValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(254),
    firstName: vine.string().trim().maxLength(80).nullable().optional(),
    lastName: vine.string().trim().maxLength(80).nullable().optional(),
    phone: vine.string().trim().maxLength(32).nullable().optional(),
    /**
     * Optional: blank makes a record-only customer (like a guest — no sign-in),
     * a value lets them sign in. Enforced to 8+ only when actually given.
     */
    password: vine.string().minLength(8).maxLength(200).optional(),
    acceptsMarketing: vine.boolean().optional(),
  })
)

const settings = new StoreSettingsService()
const customerAuth = new CustomerAuthService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/customers')

/**
 * Buyers, for staff.
 *
 * The DTO is built field by field rather than serialised from the model, for
 * the reason every DTO in this module is: `passwordHash` is one careless
 * `serialize()` away from an admin API response, and from there one careless
 * screenshot away from a support ticket.
 */
function toDto(customer: Customer, currency: string, locale: string) {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phone: customer.phone,
    status: customer.status,
    emailVerified: Boolean(customer.emailVerifiedAt),
    acceptsMarketing: customer.acceptsMarketing,
    ordersCount: customer.ordersCount,
    totalSpent: Money.toDto(customer.totalSpentAmount, currency, locale),
    /** A guest has no password and cannot sign in. Useful to see at a glance. */
    isGuest: !customer.passwordHash,
    createdAt: customer.createdAt.toISO(),
  }
}

export default class CustomersController {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/customers/index', {})
  }

  /**
   * Create a customer by hand.
   *
   * Normally a record appears on first checkout; this lets staff add one ahead
   * of that — with or without a password (see `adminCreate`).
   */
  async store(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(createValidator)
      const customer = await customerAuth.adminCreate(payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'customer.created',
        subjectType: 'customer',
        subjectId: customer.id,
        changes: { email: customer.email, isGuest: !customer.passwordHash },
        ctx,
      })

      const store = await settings.getOrCreate()
      return response.status(201).json(toDto(customer, store.currency, store.locale))
    } catch (error) {
      return fail(response, error)
    }
  }

  async index({ request, response }: HttpContext) {
    const page = Math.max(Number(request.input('page', 1)) || 1, 1)
    const pageSize = Math.min(Math.max(Number(request.input('pageSize', 20)) || 20, 1), 100)
    const store = await settings.getOrCreate()

    const builder = Customer.query().whereNull('deleted_at')

    const status = request.input('status')
    if (status && status !== 'all') builder.where('status', status)

    const search = String(request.input('search') ?? '').trim()
    if (search) {
      const term = `%${search.toLowerCase()}%`
      builder.where((query) => {
        query
          .whereRaw('LOWER(email) LIKE ?', [term])
          .orWhereRaw("LOWER(COALESCE(first_name, '')) LIKE ?", [term])
          .orWhereRaw("LOWER(COALESCE(last_name, '')) LIKE ?", [term])
      })
    }

    const result = await builder.orderBy('created_at', 'desc').paginate(page, pageSize)

    return response.json({
      items: result.all().map((customer) => toDto(customer, store.currency, store.locale)),
      total: result.total,
      page,
      pageSize,
    })
  }

  /**
   * Block or unblock a buyer.
   *
   * Blocking also revokes every live session, because a status flag that leaves
   * existing sessions working blocks nobody who is already signed in — which is
   * precisely the person being blocked.
   */
  async updateStatus(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const { status } = await request.validateUsing(statusValidator)
      const customer = await Customer.query()
        .where('id', String(params.id))
        .whereNull('deleted_at')
        .first()

      if (!customer) throw publicError.notFound('Customer not found.', 'customer_not_found')

      customer.status = status
      await customer.save()

      if (status === 'blocked') {
        await customerAuth.revokeAllSessions(customer.id)
      }

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'customer.status_changed',
        subjectType: 'customer',
        subjectId: customer.id,
        changes: { status },
        ctx,
      })

      const store = await settings.getOrCreate()
      return response.json(toDto(customer, store.currency, store.locale))
    } catch (error) {
      return fail(response, error)
    }
  }
}
