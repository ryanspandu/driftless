import type { HttpContext } from '@adonisjs/core/http'
import ProductCtaClickService from '#modules/ecommerce/services/product_cta_click_service'

const ctaClicks = new ProductCtaClickService()

export default class OutboundController {
  /**
   * `/out/:productId` — record a click on a product's `external` buy button,
   * then send the shopper onward. Mirrors `ReferralController#click`.
   *
   * A 404 here (unknown/non-external/inactive product) is fine, unlike
   * `/ref/:code`'s always-redirect rule: a referral code is semi-secret (an
   * unknown-code 404 would tell a prober which codes exist), but products are
   * already public and browsable, so there's nothing to leak.
   */
  async click(ctx: HttpContext) {
    const { params, response } = ctx
    const url = await ctaClicks.recordClick(ctx, String(params.productId))
    if (!url) return response.notFound()

    /**
     * `url` is admin-entered and validated `http(s)` server-side at save time
     * (`catalog_service.ts`) — not request input, so this needs no open-redirect
     * guard the way `/ref/:code`'s `?to=` does.
     *
     * `withQs(false)` is still required: `config/app.ts` sets
     * `redirect.forwardQueryString: true` globally, so without it any query
     * string on this request would be re-appended to the affiliate's URL.
     */
    return response.redirect().withQs(false).toPath(url)
  }
}
