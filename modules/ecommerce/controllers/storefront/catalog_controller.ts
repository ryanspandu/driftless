import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'
import CurrencyService from '#modules/ecommerce/services/currency_service'

const availabilityValidator = vine.compile(
  vine.object({
    ids: vine.array(vine.string().trim().maxLength(40)).maxLength(100),
  })
)

const catalog = new StorefrontCatalogService()
const currencies = new CurrencyService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/storefront-catalog')

/**
 * Public catalogue reads.
 *
 * Unauthenticated and throttled. Every payload comes from
 * `StorefrontCatalogService`, whose DTOs are built from scratch rather than
 * filtered — so cost price, raw stock counts and internal notes cannot appear
 * here even by accident. A functional test walks these responses asserting
 * exactly that.
 */
export default class StorefrontCatalogController {
  async index(ctx: HttpContext) {
    const { request, response } = ctx
    const result = await catalog.list(
      {
        page: Number(request.input('page', 1)) || 1,
        pageSize: Number(request.input('pageSize', 12)) || 12,
        search: request.input('search') || undefined,
        categorySlug: request.input('category') || undefined,
        featured: request.input('featured') === '1' || undefined,
        sort: request.input('sort') || undefined,
      },
      /**
       * A currency **code**, resolved against the store's enabled list — never
       * a price. An unrecognised one falls back to base rather than erroring,
       * so a stale link still shows a shop.
       */
      await currencies.forRequest(ctx)
    )
    return response.json(result)
  }

  async show(ctx: HttpContext) {
    const { params, response } = ctx
    try {
      const currency = await currencies.forRequest(ctx)
      return response.json(await catalog.findBySlug(String(params.slug), currency))
    } catch (error) {
      return fail(response, error)
    }
  }

  /** The currencies this shop sells in, for a storefront picker. */
  async currencies(ctx: HttpContext) {
    return ctx.response.json({
      selected: await currencies.forRequest(ctx),
      available: await currencies.enabled(),
    })
  }

  /**
   * Switch currency.
   *
   * Refused by name when something already in the basket is not sold in the
   * new currency — silently dropping it would take an item out of someone's
   * basket without telling them.
   */
  async setCurrency(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const code = await currencies.remember(ctx, String(request.input('currency', '')))

      const { default: CartService } = await import('#modules/ecommerce/services/cart_service')
      const carts = new CartService()
      const cart = await carts.forRequest(ctx)
      if (cart) await carts.setCurrency(cart, code)

      return response.json({ currency: code })
    } catch (error) {
      return fail(response, error)
    }
  }

  async categories({ response }: HttpContext) {
    return response.json(await catalog.categories())
  }

  /**
   * Live availability for a set of variants.
   *
   * Exists so a statically rendered page can hydrate the one thing that must
   * never be baked into a snapshot. A cached "in stock" badge for something
   * sold out an hour ago is worse than no badge at all.
   */
  async availability(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { ids } = await request.validateUsing(availabilityValidator)
      return response.json(await catalog.availability(ids))
    } catch (error) {
      return fail(response, error)
    }
  }
}
