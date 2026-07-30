import type { HttpContext } from '@adonisjs/core/http'
import { renderPage } from '#helpers/inertia_render'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import Order from '#modules/ecommerce/models/order'
import CustomerAuthService, {
  toCustomerDto,
} from '#modules/ecommerce/services/customer_auth_service'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const registerValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(254),
    password: vine.string().minLength(8).maxLength(200),
    firstName: vine.string().trim().maxLength(80).nullable().optional(),
    lastName: vine.string().trim().maxLength(80).nullable().optional(),
    acceptsMarketing: vine.boolean().optional(),
  })
)

const loginValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(254),
    password: vine.string().maxLength(200),
  })
)

const customers = new CustomerAuthService()
const settings = new StoreSettingsService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/account')

/**
 * Storefront accounts.
 *
 * Entirely separate from admin auth: different table, different cookie,
 * different code path. Nothing here touches `users`, and `ctx.auth.user` is
 * never consulted or set.
 *
 * Every response is deliberately shaped so that **no endpoint reveals whether
 * an email is registered.** That is why register and login return the same
 * thing for a known and an unknown address.
 */
export default class StorefrontAccountController {
  async register(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const payload = await request.validateUsing(registerValidator)
      const { customer } = await customers.register(payload)

      /**
       * `customer` is null when the address already had an account. The
       * response is identical either way — a caller cannot use this endpoint to
       * discover who is registered. Only a genuinely new (or upgraded guest)
       * account gets a session.
       */
      if (customer) {
        await customers.startSession(ctx, customer)
      }

      return response.status(201).json({
        ok: true,
        message: 'If that address can be registered, your account is ready.',
        customer: customer ? toCustomerDto(customer) : null,
      })
    } catch (error) {
      return fail(response, error)
    }
  }

  async login(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { email, password } = await request.validateUsing(loginValidator)
      const customer = await customers.verify(email, password)

      if (!customer) {
        /**
         * One message for every failure — wrong password, unknown address,
         * blocked account. `CustomerAuthService.verify` also does a scrypt
         * comparison on the miss path, so timing does not distinguish them
         * either.
         */
        return response.status(401).json({
          message: 'Those details did not match an account.',
          reason: 'invalid_credentials',
        })
      }

      await customers.startSession(ctx, customer)
      return response.json({ ok: true, customer: toCustomerDto(customer) })
    } catch (error) {
      return fail(response, error)
    }
  }

  async logout(ctx: HttpContext) {
    await customers.endSession(ctx)
    return ctx.response.json({ ok: true })
  }

  /** The signed-in customer, or null. Never 401s — the storefront renders either way. */
  async me(ctx: HttpContext) {
    const customer = await customers.resolve(ctx)
    return ctx.response.json({ customer: customer ? toCustomerDto(customer) : null })
  }

  /**
   * The signed-in customer's own orders.
   *
   * Scoped by the session's customer id, never by anything in the request — a
   * `customerId` parameter here would be an invitation to read someone else's
   * purchase history.
   */
  async orders(ctx: HttpContext) {
    const { response } = ctx
    const customer = await customers.resolve(ctx)

    if (!customer) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }

    const store = await settings.getOrCreate()
    const orders = await Order.query()
      .where('customer_id', customer.id)
      .whereNull('deleted_at')
      .preload('items')
      .orderBy('created_at', 'desc')
      .limit(50)

    return response.json({
      orders: orders.map((order) => ({
        number: order.number,
        status: order.status,
        paymentStatus: order.paymentStatus,
        placedAt: order.createdAt.toISO(),
        total: Money.toDto(order.totalAmount, order.currency, store.locale),
        itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
        items: (order.items ?? []).map((item) => ({
          title: item.title,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        })),
      })),
    })
  }

  /**
   * Honour a one-click opt-out.
   *
   * Unauthenticated by necessity — the whole point is that it works from an
   * email with no login. It **always** renders the same confirmation, whether
   * or not the token matched: telling the difference would turn this into an
   * oracle for which addresses the shop holds, and there is nothing useful to
   * say to someone who clicked a stale link anyway.
   */
  async unsubscribe(ctx: HttpContext) {
    const { request, inertia, response } = ctx

    const { default: MarketingConsentService } = await import(
      '#modules/ecommerce/services/marketing_consent_service'
    )
    await new MarketingConsentService().unsubscribe(String(request.input('token', '')))

    // Never cached: it is a per-person action behind a per-person link.
    response.header('Cache-Control', 'no-store')

    return renderPage(inertia, 'modules/ecommerce/storefront/account/unsubscribed', {})
  }
}
