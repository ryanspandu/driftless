import type { HttpContext } from '@adonisjs/core/http'
import { renderPage } from '#helpers/inertia_render'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import { publicError } from '#exceptions/public_error'
import Order from '#modules/ecommerce/models/order'
import Account from '#modules/ecommerce/models/account'
import AccountAuthService, { toAccountDto } from '#modules/ecommerce/services/account_auth_service'
import CustomerAddressService from '#modules/ecommerce/services/customer_address_service'
import AccountTwoFactorService from '#modules/ecommerce/services/account_two_factor_service'
import DigitalDeliveryService from '#modules/ecommerce/services/digital_delivery_service'
import AffiliateService, { type PayoutMethod } from '#modules/ecommerce/services/affiliate_service'
import { stageOf } from '#modules/ecommerce/services/order_state_machine'
import { Money } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { countryCode } from '#modules/ecommerce/validators/country'

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

const profileValidator = vine.compile(
  vine.object({
    firstName: vine.string().trim().maxLength(80).nullable().optional(),
    lastName: vine.string().trim().maxLength(80).nullable().optional(),
    phone: vine.string().trim().maxLength(32).nullable().optional(),
    acceptsMarketing: vine.boolean().optional(),
  })
)

const passwordValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().maxLength(200),
    newPassword: vine.string().minLength(8).maxLength(200),
  })
)

const addressValidator = vine.compile(
  vine.object({
    label: vine.string().trim().maxLength(64).nullable().optional(),
    firstName: vine.string().trim().maxLength(80).nullable().optional(),
    lastName: vine.string().trim().maxLength(80).nullable().optional(),
    company: vine.string().trim().maxLength(120).nullable().optional(),
    line1: vine.string().trim().minLength(1).maxLength(200),
    line2: vine.string().trim().maxLength(200).nullable().optional(),
    city: vine.string().trim().minLength(1).maxLength(120),
    state: vine.string().trim().maxLength(120).nullable().optional(),
    postalCode: vine.string().trim().maxLength(32).nullable().optional(),
    country: vine.string().trim().use(countryCode()),
    phone: vine.string().trim().maxLength(32).nullable().optional(),
    isDefaultShipping: vine.boolean().optional(),
    isDefaultBilling: vine.boolean().optional(),
  })
)

/** Update is the same shape, but everything is optional (a partial edit). */
const addressUpdateValidator = vine.compile(
  vine.object({
    label: vine.string().trim().maxLength(64).nullable().optional(),
    firstName: vine.string().trim().maxLength(80).nullable().optional(),
    lastName: vine.string().trim().maxLength(80).nullable().optional(),
    company: vine.string().trim().maxLength(120).nullable().optional(),
    line1: vine.string().trim().minLength(1).maxLength(200).optional(),
    line2: vine.string().trim().maxLength(200).nullable().optional(),
    city: vine.string().trim().minLength(1).maxLength(120).optional(),
    state: vine.string().trim().maxLength(120).nullable().optional(),
    postalCode: vine.string().trim().maxLength(32).nullable().optional(),
    country: vine.string().trim().use(countryCode()).optional(),
    phone: vine.string().trim().maxLength(32).nullable().optional(),
    isDefaultShipping: vine.boolean().optional(),
    isDefaultBilling: vine.boolean().optional(),
  })
)

const accounts = new AccountAuthService()
const settings = new StoreSettingsService()
const addresses = new CustomerAddressService()
const delivery = new DigitalDeliveryService()
const twoFactor = new AccountTwoFactorService()

const codeValidator = vine.compile(vine.object({ code: vine.string().trim().maxLength(20) }))

const affiliates = new AffiliateService()

/** A structured payout instrument submitted by an affiliate. */
const payoutMethodValidator = vine.compile(
  vine.object({
    type: vine.enum(['bank', 'ewallet', 'paypal'] as const),
    bankName: vine.string().trim().maxLength(120).optional(),
    provider: vine.string().trim().maxLength(120).optional(),
    accountNumber: vine.string().trim().maxLength(64).optional(),
    accountHolder: vine.string().trim().maxLength(160).optional(),
    email: vine.string().trim().maxLength(254).optional(),
  })
)

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
      const { account } = await accounts.register(payload)

      /**
       * `account` is null when the address already had an account. The
       * response is identical either way — a caller cannot use this endpoint to
       * discover who is registered. Only a genuinely new (or upgraded guest)
       * account gets a session.
       */
      if (account) {
        await accounts.startSession(ctx, account)
      }

      return response.status(201).json({
        ok: true,
        message: 'If that address can be registered, your account is ready.',
        account: account ? toAccountDto(account) : null,
      })
    } catch (error) {
      return fail(response, error)
    }
  }

  async login(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { email, password } = await request.validateUsing(loginValidator)
      const account = await accounts.verify(email, password)

      if (!account) {
        /**
         * One message for every failure — wrong password, unknown address,
         * blocked account. `AccountAuthService.verify` also does a scrypt
         * comparison on the miss path, so timing does not distinguish them
         * either.
         */
        return response.status(401).json({
          message: 'Those details did not match an account.',
          reason: 'invalid_credentials',
        })
      }

      // Password was right, but a 2FA account is not signed in yet. Hand back a
      // short-lived pending token (a 200, not an error, so `shopFetch` doesn't
      // throw) and wait for the code. No cookie is set until `verify2fa`.
      if (twoFactor.isEnabled(account)) {
        return response.json({
          needs2fa: true,
          pendingToken: twoFactor.issueChallengeToken(account),
        })
      }

      await accounts.startSession(ctx, account)
      return response.json({ ok: true, account: toAccountDto(account) })
    } catch (error) {
      return fail(response, error)
    }
  }

  /**
   * Second step of a 2FA login: a valid code exchanges the pending token for a
   * real session. Deliberately returns the same 401 for a bad token and a bad
   * code, so neither reveals which was wrong.
   */
  async verify2fa(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const pendingToken = String(request.input('pendingToken') ?? '')
      const { code } = await request.validateUsing(codeValidator)

      const accountId = pendingToken ? twoFactor.resolveChallengeToken(pendingToken) : null
      const account = accountId
        ? await Account.query().where('id', accountId).whereNull('deleted_at').first()
        : null

      if (!account || !account.isActive || !twoFactor.isEnabled(account)) {
        return response.status(401).json({ message: 'That code did not match.', reason: 'invalid' })
      }

      const ok = await twoFactor.verifyChallenge(account, code)
      if (!ok) {
        return response.status(401).json({ message: 'That code did not match.', reason: 'invalid' })
      }

      await accounts.startSession(ctx, account)
      const store = await settings.getOrCreate()
      return response.json({
        ok: true,
        account: toAccountDto(account, { currency: store.currency, locale: store.locale }),
      })
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Begin enrolment for the signed-in account — returns a QR URI + secret. */
  async enroll2fa(ctx: HttpContext) {
    const { response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    if (!account.passwordHash) {
      return response
        .status(422)
        .json({ message: 'Set a password before enabling 2FA.', reason: 'no_password' })
    }
    if (twoFactor.isEnabled(account)) {
      return response.status(409).json({ message: 'Two-factor is already enabled.' })
    }
    const { otpauthUri, secret } = await twoFactor.beginEnroll(account)
    return response.json({ otpauthUri, secret })
  }

  /** Confirm enrolment with a first code; returns the one-time recovery codes. */
  async confirm2fa(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    if (twoFactor.isEnabled(account)) {
      return response.status(409).json({ message: 'Two-factor is already enabled.' })
    }
    const { code } = await request.validateUsing(codeValidator)
    const recoveryCodes = await twoFactor.confirmEnroll(account, code)
    if (!recoveryCodes) {
      return response
        .status(422)
        .json({ message: 'That code did not match.', reason: 'invalid_code' })
    }
    return response.json({ recoveryCodes })
  }

  /** Disable 2FA — requires the account password; revokes other sessions. */
  async disable2fa(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    if (!twoFactor.isEnabled(account)) {
      return response.status(409).json({ message: 'Two-factor is not enabled.' })
    }
    const password = String(request.input('password') ?? '')
    const ok = await twoFactor.disable(account, password)
    if (!ok) {
      return response
        .status(422)
        .json({ message: 'Your password is incorrect.', reason: 'wrong_password' })
    }
    // A hijacked live session should not survive 2FA being turned off elsewhere.
    await accounts.revokeAllSessions(account.id)
    await accounts.startSession(ctx, account)
    return response.json({ ok: true })
  }

  async logout(ctx: HttpContext) {
    await accounts.endSession(ctx)
    return ctx.response.json({ ok: true })
  }

  /** The signed-in account, or null. Never 401s — the storefront renders either way. */
  async me(ctx: HttpContext) {
    const account = await accounts.resolve(ctx)
    if (!account) return ctx.response.json({ account: null })
    const store = await settings.getOrCreate()
    return ctx.response.json({
      account: toAccountDto(account, { currency: store.currency, locale: store.locale }),
    })
  }

  /**
   * The signed-in account's own orders.
   *
   * Scoped by the session's account id, never by anything in the request — a
   * `accountId` parameter here would be an invitation to read someone else's
   * purchase history.
   */
  async orders(ctx: HttpContext) {
    const { response } = ctx
    const account = await accounts.resolve(ctx)

    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }

    const store = await settings.getOrCreate()
    const orders = await Order.query()
      .where('account_id', account.id)
      .whereNull('deleted_at')
      .preload('items')
      .orderBy('created_at', 'desc')
      .limit(50)

    return response.json({
      orders: orders.map((order) => ({
        number: order.number,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        stage: stageOf(order),
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
   * One of the signed-in account's orders, in full.
   *
   * Scoped by `account.id` **and** the number — an order that is not theirs 404s
   * exactly like one that does not exist, so the number space cannot be probed.
   * This is the token order page's data, but session-authorised and including the
   * shipping address (it is the account's own).
   */
  async orderDetail(ctx: HttpContext) {
    const { params, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }

    const order = await Order.query()
      .where('number', String(params.number))
      .where('account_id', account.id)
      .whereNull('deleted_at')
      .preload('items')
      .first()
    if (!order) throw publicError.notFound('Order not found.', 'order_not_found')

    const store = await settings.getOrCreate()
    const money = (amount: number) => Money.toDto(amount, order.currency, store.locale)

    const downloads = order.isPaid ? await delivery.grantsForOrder(order.id) : []

    return response.json({
      number: order.number,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      stage: stageOf(order),
      paid: order.isPaid,
      email: order.email,
      placedAt: order.createdAt.toISO(),
      shippedAt: order.shippedAt?.toISO() ?? null,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      customerNote: order.customerNote,
      shippingAddress: order.shippingAddress ?? null,
      subtotal: money(order.subtotalAmount),
      discount: order.discountAmount ? money(order.discountAmount) : null,
      shipping: money(order.shippingAmount),
      tax: money(order.taxAmount),
      total: money(order.totalAmount),
      items: (order.items ?? []).map((item) => ({
        title: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        quantity: item.quantity,
        unit: money(item.unitAmount),
        total: money(item.totalAmount),
        imageUrl: item.imageUrl,
      })),
      downloads: downloads.map((grant) => ({
        ...grant,
        // Session-authorised — no token in the URL, unlike the guest order page.
        url: grant.live ? `/api/shop/account/orders/${order.number}/downloads/${grant.id}` : null,
      })),
    })
  }

  /** Stream a purchased file for the signed-in owner (no token; session-scoped). */
  async downloadOrderFile(ctx: HttpContext) {
    const { params, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }

    try {
      const file = await delivery.redeemForCustomer(String(params.grantId ?? ''), account.id, ctx)
      response.header('Content-Type', file.mimeType)
      response.header('Content-Length', String(file.sizeBytes))
      response.header('Content-Disposition', `attachment; filename="${file.filename}"`)
      response.header('X-Content-Type-Options', 'nosniff')
      response.header('Cache-Control', 'private, no-store')
      return response.stream(file.stream)
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Edit the signed-in account's own profile (not email — that's the account key). */
  async updateProfile(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const payload = await request.validateUsing(profileValidator)
      await accounts.updateProfile(account, payload)
      const store = await settings.getOrCreate()
      return response.json({
        account: toAccountDto(account, { currency: store.currency, locale: store.locale }),
      })
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Change password, then re-issue this device's session (the rest are revoked). */
  async changePassword(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const { currentPassword, newPassword } = await request.validateUsing(passwordValidator)
      await accounts.changePassword(account, currentPassword, newPassword)
      // Every session was just revoked (including this one) — mint a fresh one so
      // the shopper who made the change stays signed in on this device.
      await accounts.startSession(ctx, account)
      return response.json({ ok: true })
    } catch (error) {
      return fail(response, error)
    }
  }

  async addresses(ctx: HttpContext) {
    const { response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    return response.json({ addresses: await addresses.list(account.id) })
  }

  async createAddress(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const payload = await request.validateUsing(addressValidator)
      return response.status(201).json(await addresses.create(account.id, payload))
    } catch (error) {
      return fail(response, error)
    }
  }

  async updateAddress(ctx: HttpContext) {
    const { params, request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const payload = await request.validateUsing(addressUpdateValidator)
      return response.json(await addresses.update(account.id, String(params.id), payload))
    } catch (error) {
      return fail(response, error)
    }
  }

  async deleteAddress(ctx: HttpContext) {
    const { params, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      await addresses.remove(account.id, String(params.id))
      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
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

    const { default: MarketingConsentService } =
      await import('#modules/ecommerce/services/marketing_consent_service')
    await new MarketingConsentService().unsubscribe(String(request.input('token', '')))

    // Never cached: it is a per-person action behind a per-person link.
    response.header('Cache-Control', 'no-store')

    return renderPage(inertia, 'modules/ecommerce/storefront/account/unsubscribed', {})
  }

  // ── Affiliate ──────────────────────────────────────────────────────────────

  /** Everything the account's Affiliate tab renders. */
  async affiliateOverview(ctx: HttpContext) {
    const { response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    return response.json(await affiliates.overviewForAccount(account))
  }

  /** Apply (or re-apply after a rejection) to join the affiliate program. */
  async applyAffiliate(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const message = String(request.input('message') ?? '')
      await affiliates.apply(account, message)
      return response.json(await affiliates.overviewForAccount(account))
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Save or replace the affiliate's payout method. */
  async updatePayoutMethod(ctx: HttpContext) {
    const { request, response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const affiliate = await affiliates.findByAccountId(account.id)
      if (!affiliate) {
        return response.status(404).json({ message: 'Not an affiliate.', reason: 'not_affiliate' })
      }
      const payload = await request.validateUsing(payoutMethodValidator)
      await affiliates.setPayoutMethod(affiliate, payload as PayoutMethod)
      return response.json(await affiliates.overviewForAccount(account))
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Request a payout of the available balance. */
  async requestWithdrawal(ctx: HttpContext) {
    const { response } = ctx
    const account = await accounts.resolve(ctx)
    if (!account) {
      return response.status(401).json({ message: 'Sign in first.', reason: 'not_signed_in' })
    }
    try {
      const affiliate = await affiliates.findByAccountId(account.id)
      if (!affiliate || !affiliate.isEarning) {
        return response
          .status(422)
          .json({ message: 'Your affiliate account is not active.', reason: 'not_active' })
      }
      await affiliates.requestWithdrawal(affiliate)
      return response.json(await affiliates.overviewForAccount(account))
    } catch (error) {
      return fail(response, error)
    }
  }
}
