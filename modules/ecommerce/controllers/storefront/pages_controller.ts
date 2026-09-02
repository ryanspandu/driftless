import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import { renderPage } from '#helpers/inertia_render'
import Page from '#models/page'
import PageRenderer from '#services/page_renderer'
import SiteChromeService from '#services/site_chrome_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'
import CurrencyService from '#modules/ecommerce/services/currency_service'
import CartService from '#modules/ecommerce/services/cart_service'
import GatewayCredentialsService from '#modules/ecommerce/services/gateway_credentials_service'
import { Money } from '#modules/ecommerce/services/money'
import { absoluteUrl } from '#helpers/site_url'

const carts = new CartService()
const credentials = new GatewayCredentialsService()
const storeSettings = new StoreSettingsService()
const catalog = new StorefrontCatalogService()
const currencies = new CurrencyService()
const renderer = new PageRenderer()
const siteChrome = new SiteChromeService()

/**
 * Where product pages live.
 *
 * A constant, not a setting. Routes are registered once at boot, so a
 * configurable prefix would either need a restart to take effect or — worse —
 * let an operator point it at `/admin/…` and shadow the dashboard. It is
 * exported so the route registration and the canonical URL cannot drift apart.
 */
export const PRODUCT_PATH_PREFIX = '/shop/p'

/**
 * Storefront pages that are not builder pages.
 *
 * Cart, checkout and order confirmation are application screens rather than
 * content: they are per-visitor and must never be cached or server-rendered
 * into a shared snapshot. They live as module UI, which `layout-shell` routes
 * to `PublicLayout` — the admin chrome regex only matches `modules/*​/admin/*`.
 *
 * The catalogue is the opposite: it *is* content, so it is built from Puck
 * blocks on ordinary pages and gets SSR/SSG for free.
 */
export default class StorefrontPagesController {
  /**
   * The builder page an operator has assigned to a storefront slot, or null.
   *
   * Only a live, published page counts — a draft or deleted one falls back to
   * the built-in fixed screen rather than 404ing, since the fixed screen is the
   * default the override merely stands in for. Mirrors the `shopFront` lookup.
   */
  private async overridePage(pageId: string | null): Promise<Page | null> {
    if (!pageId) return null
    return Page.query()
      .where('id', pageId)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()
  }

  /**
   * Render a fixed storefront screen inside the site's header/footer.
   *
   * These pages are hand-written Inertia components, not builder pages, so they
   * never went through `PageRenderer` and got no site chrome. Resolving it here
   * and passing it as props gives them the same header/footer every other public
   * page has (an override page, rendered via `renderer.render`, already gets it).
   */
  private async renderStorefront(
    ctx: HttpContext,
    component: string,
    props: Record<string, unknown> = {}
  ) {
    const chrome = await siteChrome.resolve()
    return renderPage(ctx.inertia, component, { ...chrome, ...props })
  }

  async cart(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const page = await this.overridePage(store.cartPageId)
    // `skipSnapshot`: a basket is per-visitor and must never be cached into a
    // shared snapshot. The block that renders it fetches client-side, so the
    // SSR shell holds nothing visitor-specific.
    if (page) return renderer.render(page, ctx, { skipSnapshot: true })
    return this.renderStorefront(ctx, 'modules/ecommerce/storefront/cart')
  }

  /**
   * The checkout form.
   *
   * Which payment buttons to show is decided here, server-side, from the
   * gateways that actually have usable credentials — not from anything the
   * client could assert. An override page gets the same list from
   * `GET /api/shop/checkout/config`, so the rule stays in one place.
   */
  async checkout(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const page = await this.overridePage(store.checkoutPageId)
    if (page) return renderer.render(page, ctx, { skipSnapshot: true })

    const [gateways, cart] = await Promise.all([
      credentials.enabledGateways(),
      carts.forRequest(ctx),
    ])

    const dto = cart ? await carts.toDto(cart) : null

    return this.renderStorefront(ctx, 'modules/ecommerce/storefront/checkout', {
      gateways,
      // Lets the form skip the address section entirely for a downloads-only
      // basket rather than asking for a delivery address it will never use.
      digitalOnly: dto?.digitalOnly ?? false,
    })
  }

  async order(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const page = await this.overridePage(store.orderPageId)
    if (page) return renderer.render(page, ctx, { skipSnapshot: true })
    return this.renderStorefront(ctx, 'modules/ecommerce/storefront/order')
  }

  /**
   * `/{prefix}/:slug` — one builder page, every product.
   *
   * The operator designs a single page in the builder, drops a `ProductDetail`
   * block on it and leaves the slug blank; this route binds the URL's slug to
   * that block. Without it a catalogue needs one builder page per product,
   * which stops being workable at about the tenth one.
   *
   * The product is loaded here as well as by the block resolver, for two
   * reasons that both matter: an unknown or unpublished slug must 404 rather
   * than render an empty template, and the page's `<title>` and description
   * have to come from the product — otherwise every product in the catalogue
   * shares the template's SEO, which defeats the point of having pages at all.
   */
  async product(ctx: HttpContext) {
    const { params } = ctx
    const slug = String(params.slug ?? '').trim()

    /**
     * Explicitly typed `() => never`, which is what lets TypeScript narrow the
     * nullables below — an inferred const arrow does not get that treatment.
     */
    const notFound: () => never = () => {
      throw new Exception('Product not found', { status: 404, code: 'E_PAGE_NOT_FOUND' })
    }

    if (!slug) notFound()

    const store = await storeSettings.getOrCreate()
    const templateId = store.productPageId
    if (!templateId) notFound()

    /**
     * Resolved in the shopper's currency, so a product not sold in it 404s
     * here rather than rendering a page with no price on it.
     */
    const currency = await currencies.forRequest(ctx)
    const product = await catalog.findBySlug(slug, currency).catch(() => null)
    if (!product) notFound()

    const page = await Page.query()
      .where('id', templateId)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()

    // The template was deleted or unpublished. A 404 is honest; rendering
    // nothing would look like the product had vanished.
    if (!page) notFound()

    const seo = (product.seo ?? {}) as Record<string, unknown>
    const productUrl = absoluteUrl(`${PRODUCT_PATH_PREFIX}/${product.slug}`)

    // schema.org Product node for rich results (price, image, availability).
    const productJsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': product.title,
      ...(product.subtitle ? { description: product.subtitle } : {}),
      ...(product.images.length ? { image: product.images.map((i) => absoluteUrl(i.url)) } : {}),
      'url': productUrl,
      ...(product.priceFrom
        ? {
            offers: {
              '@type': 'Offer',
              'priceCurrency': product.priceFrom.currency,
              'price': Money.toMajor(product.priceFrom.amount, product.priceFrom.currency),
              'availability': 'https://schema.org/InStock',
              'url': productUrl,
            },
          }
        : {}),
    }

    return renderer.render(page, ctx, {
      bindings: { params: { slug } },
      /**
       * The template's SEO is the fallback; the product's own wins field by
       * field. `canonicalPath` matters most — without it every product would
       * declare the template's path as canonical and search engines would index
       * one page for the whole catalogue.
       */
      seoOverride: {
        title: (seo.title as string) || product.title,
        description: (seo.description as string) || product.subtitle || null,
        imageUrl: product.images[0]?.url ?? null,
        canonicalPath: `${PRODUCT_PATH_PREFIX}/${product.slug}`,
        jsonLd: [productJsonLd],
      },
      /**
       * Never snapshot. The cache is keyed on the page, so storing one
       * product's HTML would serve it for every other product on the same
       * template — the single worst bug this feature could have.
       */
      skipSnapshot: true,
    })
  }

  /**
   * `/shop` — the shop front, rendered from a builder page.
   *
   * A page rather than a fixed template because the catalogue is **content**:
   * the operator redesigns it in the builder like any other page, and gets
   * SSR/SSG and SEO for free. `/shop` is a reserved first segment, so the CMS
   * catch-all would never serve it — this route does instead.
   *
   * Unlike `/shop/p/:slug` this **is** snapshot-able: one URL, one page, no
   * per-record binding. Whatever render mode the operator chose applies
   * normally.
   */
  async shopFront(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const pageId = store.shopPageId

    if (!pageId) {
      throw new Exception('Shop front not configured', {
        status: 404,
        code: 'E_PAGE_NOT_FOUND',
      })
    }

    const page = await Page.query()
      .where('id', pageId)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()

    if (!page) {
      throw new Exception('Shop front not published', {
        status: 404,
        code: 'E_PAGE_NOT_FOUND',
      })
    }

    return renderer.render(page, ctx)
  }

  // ── Account ──────────────────────────────────────────────────────────────

  /**
   * All three account screens are plain CSR pages with no server-side auth
   * gate.
   *
   * That is safe because they hold nothing: every one of them fetches from
   * `/api/shop/...`, and *those* endpoints check the session. Gating the page
   * itself would add a second place for the rule to live, and a second place
   * for it to be wrong.
   */
  async accountLogin(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const page = await this.overridePage(store.loginPageId)
    if (page) return renderer.render(page, ctx, { skipSnapshot: true })
    return this.renderStorefront(ctx, 'modules/ecommerce/storefront/account/login')
  }

  async accountRegister(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const page = await this.overridePage(store.registerPageId)
    if (page) return renderer.render(page, ctx, { skipSnapshot: true })
    return this.renderStorefront(ctx, 'modules/ecommerce/storefront/account/register')
  }

  async account(ctx: HttpContext) {
    const store = await storeSettings.getOrCreate()
    const page = await this.overridePage(store.accountPageId)
    if (page) return renderer.render(page, ctx, { skipSnapshot: true })
    return this.renderStorefront(ctx, 'modules/ecommerce/storefront/account/index')
  }
}
