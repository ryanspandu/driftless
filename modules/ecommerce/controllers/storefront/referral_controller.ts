import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'
import CartService from '#modules/ecommerce/services/cart_service'
import DiscountService from '#modules/ecommerce/services/discount_service'
import PricingService from '#modules/ecommerce/services/pricing_service'

const discountCheckValidator = vine.compile(
  vine.object({
    code: vine.string().trim().minLength(1).maxLength(64),
    email: vine.string().trim().email().maxLength(254).nullable().optional(),
  })
)

const affiliates = new AffiliateService()
const discounts = new DiscountService()
const carts = new CartService()
const pricing = new PricingService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/referral')

export default class ReferralController {
  /**
   * `/ref/:code` — record a referral click and send the visitor onward.
   *
   * Always redirects, even for an unknown code: a link that 404s tells whoever
   * is probing which codes exist, and a broken affiliate link is a worse
   * experience than a link that simply does not earn.
   */
  async click(ctx: HttpContext) {
    const { params, request, response } = ctx
    const code = String(params.code ?? '')

    await affiliates.recordClick(ctx, code, request.input('to') || null)

    /**
     * The destination is a **path only**, never a full URL: honouring an
     * absolute `?to=` would turn this into an open redirect that borrows the
     * shop's domain for a phishing link.
     */
    const requested = String(request.input('to') ?? '/')
    const target = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

    /**
     * `withQs(false)` is required, not cosmetic.
     *
     * `config/app.ts` sets `redirect.forwardQueryString: true` globally, so
     * without this the incoming `?to=…` is re-appended to the destination —
     * putting the referral plumbing into every landing URL and, worse,
     * re-attaching the very off-site value that was just rejected above.
     */
    return response.redirect().withQs(false).toPath(target)
  }

  /**
   * Check a discount code against the current basket.
   *
   * Rate-limited hard: this is the brute-force surface for guessing codes. It
   * also never distinguishes "no such code" from "not valid for you", so it
   * cannot be used to enumerate which codes exist.
   */
  async checkDiscount(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { code, email } = await request.validateUsing(discountCheckValidator)

      const cart = await carts.forRequest(ctx)
      const lines = cart ? await carts.lines(cart) : []

      if (lines.length === 0) {
        return response.status(422).json({
          message: 'Add something to your basket first.',
          reason: 'empty_basket',
        })
      }

      const basket = await pricing.price(lines)
      const evaluation = await discounts.validate(code, basket, email ?? null)

      /**
       * Returns only what the shopper needs to see. The discount's limits,
       * usage counts and internal id stay on the server.
       */
      return response.json({
        code: evaluation.discount.code,
        description: evaluation.discount.description,
        freeShipping: evaluation.freeShipping,
        amount: evaluation.amount,
      })
    } catch (error) {
      return fail(response, error)
    }
  }
}
