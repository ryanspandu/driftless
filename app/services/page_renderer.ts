import type { HttpContext } from '@adonisjs/core/http'
import type Page from '#models/page'
import PagesService from '#services/pages_service'
import TemplatesService from '#services/templates_service'
import { WebSettingsService } from '#services/settings_service'
import { resolvePageCollections } from '#services/page_data_resolver'
import { resolveBlockData, type BlockRenderContext } from '#services/block_data_resolvers'
import { renderPage } from '#helpers/inertia_render'
import { buildJsonLd } from '#services/structured_data_service'
import { absoluteUrl } from '#helpers/site_url'
import { publicBlockCss } from '#services/public_block_css'

const pagesService = new PagesService()
const templatesService = new TemplatesService()
const webSettingsService = new WebSettingsService()

export const SSG_CACHE = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

/**
 * Placeholder that stands in for the CSP nonce inside a stored SSG snapshot.
 *
 * A snapshot is rendered once with that request's nonce and re-served verbatim on
 * later requests — but Shield sets a FRESH nonce in each response's CSP header, so
 * a baked-in nonce would never match and every nonced `<style>`/`<script>` would be
 * dropped. So the render-time nonce is rewritten to this sentinel before caching,
 * and `PagesPublicController` swaps the sentinel back to the current request's nonce
 * when it serves the snapshot — keeping the HTML in lockstep with the live header.
 */
export const CSP_NONCE_SENTINEL = '__CSP_NONCE__'

export interface RenderPageOptions {
  /** Admin preview: always fresh, never cached, any status. */
  preview?: boolean
  /**
   * Route bindings for a page acting as a template.
   *
   * Passed to the block resolvers so a block with no explicit target inherits
   * whatever the URL named — which is what lets one designed page serve every
   * product instead of one page per product.
   */
  bindings?: BlockRenderContext
  /**
   * The server-resolved record this page is a template for (e.g. the product on
   * `/shop/p/<slug>`). Forwarded to a CODE page's props as `record` so a kit
   * page renders SSR from props instead of client-fetching. Ignored for builder
   * pages (their blocks get data through the resolvers instead).
   */
  record?: Record<string, unknown> | null
  /**
   * Overrides for the page's own SEO.
   *
   * A template page has one title; the records it renders each have their own.
   * Without this every product would share the template's `<title>`, which is
   * an SEO problem serious enough to make the whole template approach pointless.
   */
  seoOverride?: {
    title?: string | null
    description?: string | null
    imageUrl?: string | null
    canonicalPath?: string | null
    /**
     * Extra schema.org nodes (e.g. a `Product`) spread into the page's JSON-LD
     * graph. Lets a module contribute rich-result data for the record it renders.
     */
    jsonLd?: unknown[]
  }
  /**
   * Skip the SSG snapshot even for an SSG page.
   *
   * Required for a template: the snapshot is keyed on the page, so caching one
   * product's render would serve it for every other product on the same
   * template.
   */
  skipSnapshot?: boolean
}

/**
 * Composes a builder page and renders it.
 *
 * Extracted from `PagesPublicController` so the same composition — layout,
 * header, footer, referenced templates, bound collections, block data, site-wide
 * code and meta — is available to any route that renders a builder page, not
 * just the CMS catch-all. The e-commerce module's product route is the first
 * other caller.
 */
export default class PageRenderer {
  async render(page: Page, ctx: HttpContext, options: RenderPageOptions = {}) {
    const { request, inertia, response } = ctx
    const preview = options.preview ?? false
    const isInertiaVisit = Boolean(request.header('x-inertia'))

    /**
     * Kind → renderer, render mode → SSR or not.
     *
     * Both wrappers take the same shape of props; a CODE page simply names a
     * component instead of carrying a block tree. SSR/SSG use the
     * SSR-allowlisted variant; CSR stays client-rendered. Preview is always
     * uncached.
     */
    const isCode = page.kind === 'CODE'
    /**
     * A code page resolves blocks only when it actually has some.
     *
     * Its `content` is the document behind `<BuilderRegion />`. A code page
     * with no region leaves it empty, and resolving template refs, collections
     * and block data over an empty document is pure cost on every request —
     * but a page *with* a region needs all three, or a CollectionList inside it
     * would render nothing that a builder page renders fine.
     */
    const hasRegion = isCode && hasBlocks(page.content)
    const resolveBlocks = !isCode || hasRegion
    const serverRendered = page.renderMode !== 'CSR'
    const component = isCode
      ? serverRendered
        ? 'public/code_ssr'
        : 'public/code'
      : serverRendered
        ? 'public/page_ssr'
        : 'public/page'
    if (preview || options.skipSnapshot) {
      /**
       * `skipSnapshot` means this page is rendering *someone else's* record, so
       * its output must not be cached under its own URL either — not in our
       * snapshot and not in a shared cache in front of it. Setting the header
       * here rather than leaving it to the caller is what makes that
       * unmissable: the caller's header would be overwritten by the branches
       * below.
       */
      response.header('Cache-Control', 'no-store')
    } else if (page.renderMode === 'SSG') {
      response.header('Cache-Control', SSG_CACHE)
    } else if (page.renderMode === 'SSR') {
      response.header('Cache-Control', 'no-store')
    }

    // Composition. A LAYOUT template (when set) wraps the page and owns its own
    // header/footer; otherwise resolve a header/footer template — a per-page
    // override if set, else the site default for that type.
    // A per-page CODE layout (a kit component) replaces the builder layout for
    // the wrap slot; the pointer is carried to the client, not a Puck doc.
    const layoutContent = page.codeLayout
      ? null
      : page.layoutId
        ? ((await templatesService.find(page.layoutId).catch(() => null))?.content ?? null)
        : // No per-page layout → fall back to the site default LAYOUT (mirrors how
          // header/footer resolve their defaults). Previously a default LAYOUT was
          // never applied to any page.
          ((await templatesService.getDefault('LAYOUT').catch(() => null))?.content ?? null)

    // A layout (code or builder) owns header/footer, so they are only resolved
    // when there is none.
    const hasLayout = Boolean(page.codeLayout) || Boolean(layoutContent)
    let headerContent: Record<string, unknown> | null = null
    let footerContent: Record<string, unknown> | null = null
    if (!hasLayout) {
      /**
       * Four states per slot: a code component (`codeHeader`), a named builder
       * template, the site default, or nothing (`hideHeader`). A set code
       * pointer wins over the builder template for its slot, and its Puck doc is
       * left null (the pointer travels separately, in the render props).
       */
      const header =
        page.hideHeader || page.codeHeader
          ? null
          : page.headerTemplateId
            ? await templatesService.find(page.headerTemplateId).catch(() => null)
            : await templatesService.getDefault('HEADER')
      const footer =
        page.hideFooter || page.codeFooter
          ? null
          : page.footerTemplateId
            ? await templatesService.find(page.footerTemplateId).catch(() => null)
            : await templatesService.getDefault('FOOTER')
      headerContent = header?.content ?? null
      footerContent = footer?.content ?? null
    }

    /**
     * The header and footer are resolved for a code page regardless — it can
     * opt into them via `<SiteChrome>` — but the page's own document is only
     * walked when it has a region to fill.
     */
    const templates = resolveBlocks
      ? await templatesService.resolveRefs([
          page.content,
          layoutContent,
          headerContent,
          footerContent,
        ])
      : {}

    const composedDocs = [
      page.content,
      layoutContent,
      headerContent,
      footerContent,
      ...Object.values(templates),
    ]

    const collections =
      !resolveBlocks || page.renderMode === 'CSR'
        ? undefined
        : // Pass the route bindings so a `posts` CollectionList on a category/tag
          // archive-override page inherits {slug,kind} as its taxonomy filter.
          await resolvePageCollections(composedDocs, options.bindings)

    /**
     * SSG skips **volatile** resolvers: price and stock must not be baked into
     * a cached snapshot. Those blocks hydrate on the client instead.
     */
    const blockData =
      !resolveBlocks || page.renderMode === 'CSR'
        ? undefined
        : await resolveBlockData(composedDocs, {
            includeVolatile: page.renderMode !== 'SSG' || preview,
            /**
             * Route bindings plus the request's own query and cookies. Core
             * forwards both without interpreting them, so a module's resolver
             * can read what it needs — the commerce blocks use it to render in
             * the shopper's chosen currency.
             */
            context: {
              ...options.bindings,
              query: request.qs() as Record<string, string>,
              cookies: request.cookiesList() as Record<string, string>,
            },
          })

    const [globalCode, globalMeta, breakpoints, appearance] = await Promise.all([
      webSettingsService.getGlobalCode(),
      webSettingsService.getSiteMetaTags(),
      webSettingsService.getBreakpointsRaw(),
      webSettingsService.getPublicAppearance(),
    ])

    /**
     * The record's own SEO wins over the template's, field by field — a
     * template that sets an image but no title should still contribute its
     * image. The override arrives with the renderer's own key names
     * (`imageUrl`/`canonicalPath`); map them to what the head actually reads
     * (`ogImage`/`canonical`) and absolutise the canonical, or a template's
     * per-record image and canonical are silently dropped.
     */
    const ov = options.seoOverride
    const mappedOverride = ov
      ? stripUndefined({
          title: ov.title ?? undefined,
          description: ov.description ?? undefined,
          ogImage: ov.imageUrl ?? undefined,
          canonical: ov.canonicalPath ? absoluteUrl(ov.canonicalPath) : undefined,
        })
      : undefined
    const baseSeo: Record<string, unknown> = mappedOverride
      ? { ...(page.seo ?? {}), ...mappedOverride }
      : (page.seo ?? {})

    const isHome = request.url() === '/'
    /**
     * Canonical URL as a SYSTEM default, not an operator-only field: an
     * operator-set `seo.canonical` still wins, otherwise the URL actually being
     * served. A role-slot override (home/blog/shop-front/cart/...) renders a
     * single stored Page at a fixed URL that has nothing to do with that page's
     * own `path` column — falling back to `page.path` there shipped the wrong
     * canonical (e.g. `/` advertising itself as `/home`). The request's own
     * path is right for that case AND for a normal page (whose `path` column IS
     * the URL it's served at), so there's no need to special-case either one.
     * The head component (`public-page-head`) reads `seo.canonical`.
     */
    const requestPath = request.url()
    const canonical =
      (typeof baseSeo.canonical === 'string' && baseSeo.canonical) || absoluteUrl(requestPath)

    /**
     * Structured data (JSON-LD). Serialised here and carried on the seo bag as a
     * ready-to-embed string, so the shared head component emits it inside the
     * SSR-rendered `<head>` — captured in both live responses and the SSG
     * snapshot with no extra plumbing.
     */
    const jsonLd = buildJsonLd({
      url: canonical,
      title: (typeof baseSeo.title === 'string' && baseSeo.title) || ov?.title || page.title,
      description: typeof baseSeo.description === 'string' ? baseSeo.description : undefined,
      siteName: appearance.siteTitle,
      logoUrl: appearance.faviconUrl,
      isHome,
      path: requestPath,
      extra: ov?.jsonLd,
      custom: typeof baseSeo.jsonLdCustom === 'string' ? baseSeo.jsonLdCustom : null,
    })
    const seo = { ...baseSeo, canonical, ...(jsonLd ? { jsonLd } : {}) }

    const result = await renderPage(
      inertia,
      component,
      {
        page: {
          title: options.seoOverride?.title ?? page.title,
          path: page.path,
          // The slug the custom renderer looks up; absent for builder pages.
          component: isCode ? (page.component ?? '') : undefined,
          content: page.content,
          seo,
          // Render-critical block stylesheets, linked in the initial <head> to
          // prevent a FOUC (the Vite @vite tag omits dynamic-chunk CSS).
          blockCss: publicBlockCss(),
          layout: layoutContent,
          header: headerContent ?? undefined,
          footer: footerContent ?? undefined,
          codeHeader: page.codeHeader ?? undefined,
          codeFooter: page.codeFooter ?? undefined,
          codeLayout: page.codeLayout ?? undefined,
          templates,
          collections,
          blockData,
          globalCode,
          globalMeta,
          breakpoints,
          preview,
          // Echoed to the client so a block can inherit the binding there too.
          bindings: options.bindings?.params,
          // The server-resolved record (e.g. product) for a CODE template page.
          record: options.record ?? undefined,
        },
      },
      // View local (not an Inertia prop) — the favicon <link> in the shell
      // needs to be right in the initial HTML, before any React code runs.
      { faviconUrl: appearance.faviconUrl }
    )

    /**
     * Snapshot the rendered HTML for subsequent requests (full loads only).
     * Never for a preview, and never for a template render — the snapshot is
     * keyed on the page, so caching one record's output would serve it for
     * every other record on the same template.
     */
    if (
      !preview &&
      !options.skipSnapshot &&
      page.renderMode === 'SSG' &&
      !isInertiaVisit &&
      typeof result === 'string'
    ) {
      // Freeze the nonce as a sentinel so the snapshot can be re-nonced per request
      // on serve (see `CSP_NONCE_SENTINEL`). This request still gets `result` with
      // its real nonce, which matches the header Shield already set for it.
      const nonce = response.nonce
      const snapshot = nonce ? result.replaceAll(nonce, CSP_NONCE_SENTINEL) : result
      await pagesService.cacheRenderedHtml(page.id, snapshot)
    }

    return result
  }
}

/** A document with no blocks in it — `undefined`, `{}` or an empty `content`. */
function hasBlocks(doc: Record<string, unknown> | undefined | null): boolean {
  if (!doc || !Object.keys(doc).length) return false
  const content = (doc as { content?: unknown }).content
  return Array.isArray(content) ? content.length > 0 : Boolean(content)
}

/** Drop `undefined` so a partial override does not erase what it omits. */
function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out as Partial<T>
}
