import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'
import PagesService from '#services/pages_service'
import TemplatesService from '#services/templates_service'
import { WebSettingsService } from '#services/settings_service'
import { resolvePageCollections } from '#services/page_data_resolver'
import { resolveBlockData, type BlockRenderContext } from '#services/block_data_resolvers'
import { renderPage } from '#helpers/inertia_render'

const pagesService = new PagesService()
const templatesService = new TemplatesService()
const webSettingsService = new WebSettingsService()

export const SSG_CACHE = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

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

    // Render mode → component + caching. SSR/SSG use the SSR-allowlisted
    // component; CSR stays client-rendered. Preview is always uncached.
    const component = page.renderMode === 'CSR' ? 'public/page' : 'public/page_ssr'
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
    const layoutContent = page.layoutId
      ? ((await templatesService.find(page.layoutId).catch(() => null))?.content ?? null)
      : null

    let headerContent: Record<string, unknown> | null = null
    let footerContent: Record<string, unknown> | null = null
    if (!layoutContent) {
      const header = page.headerTemplateId
        ? await templatesService.find(page.headerTemplateId).catch(() => null)
        : await templatesService.getDefault('HEADER')
      const footer = page.footerTemplateId
        ? await templatesService.find(page.footerTemplateId).catch(() => null)
        : await templatesService.getDefault('FOOTER')
      headerContent = header?.content ?? null
      footerContent = footer?.content ?? null
    }

    const templates = await templatesService.resolveRefs([
      page.content,
      layoutContent,
      headerContent,
      footerContent,
    ])

    const composedDocs = [
      page.content,
      layoutContent,
      headerContent,
      footerContent,
      ...Object.values(templates),
    ]

    const collections =
      page.renderMode === 'CSR' ? undefined : await resolvePageCollections(composedDocs)

    /**
     * SSG skips **volatile** resolvers: price and stock must not be baked into
     * a cached snapshot. Those blocks hydrate on the client instead.
     */
    const blockData =
      page.renderMode === 'CSR'
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

    const [globalCode, globalMeta] = await Promise.all([
      webSettingsService.getGlobalCode(),
      webSettingsService.getSiteMetaTags(),
    ])

    /**
     * The record's own SEO wins over the template's, field by field — a
     * template that sets an image but no title should still contribute its
     * image.
     */
    const seo = options.seoOverride
      ? { ...(page.seo ?? {}), ...stripUndefined(options.seoOverride) }
      : page.seo

    const result = await renderPage(inertia, component, {
      page: {
        title: options.seoOverride?.title ?? page.title,
        path: page.path,
        content: page.content,
        seo,
        layout: layoutContent,
        header: headerContent ?? undefined,
        footer: footerContent ?? undefined,
        templates,
        collections,
        blockData,
        globalCode,
        globalMeta,
        preview,
        // Echoed to the client so a block can inherit the binding there too.
        bindings: options.bindings?.params,
      },
    })

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
      await pagesService.cacheRenderedHtml(page.id, result)
    }

    return result
  }
}

/** Drop `undefined` so a partial override does not erase what it omits. */
function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out as Partial<T>
}
