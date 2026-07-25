import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'
import PagesService from '#services/pages_service'
import TemplatesService from '#services/templates_service'
import { WebSettingsService } from '#services/settings_service'
import { resolvePageCollections } from '#services/page_data_resolver'
import { renderPage } from '#helpers/inertia_render'

const pagesService = new PagesService()
const templatesService = new TemplatesService()
const webSettingsService = new WebSettingsService()

/** Route prefixes that must never be treated as a builder page path. */
const RESERVED_FIRST_SEGMENT = new Set([
  'api',
  'admin',
  'auth',
  'login',
  'register',
  'logout',
  'offline',
  'health',
  'assets',
  'build',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
])

const SSG_CACHE = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

export default class PagesPublicController {
  /** Catch-all renderer for PUBLISHED builder pages, matched by `path`. */
  async show(ctx: HttpContext) {
    const { params, request, response } = ctx
    const raw = (params as Record<string, unknown>)['*']
    const path = (Array.isArray(raw) ? raw.join('/') : String(raw ?? '')).replace(/^\/+|\/+$/g, '')

    if (!path || RESERVED_FIRST_SEGMENT.has(path.split('/')[0])) {
      return response.notFound('Page not found')
    }

    const page = await Page.query()
      .where('path', path)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()

    if (!page) {
      return response.notFound('Page not found')
    }

    // SSG: serve the cached HTML snapshot on full page loads when present.
    const isInertiaVisit = Boolean(request.header('x-inertia'))
    if (
      page.renderMode === 'SSG' &&
      !isInertiaVisit &&
      typeof page.renderedHtml === 'string' &&
      page.renderedHtml.length > 0
    ) {
      response.header('Cache-Control', SSG_CACHE)
      return response.header('Content-Type', 'text/html; charset=utf-8').send(page.renderedHtml)
    }

    return this.composeAndRender(page, ctx, false)
  }

  /**
   * Admin-only **preview**: render a page by id at ANY status (Draft included),
   * always fresh (no SSG cache). Auth-gated via the `/admin/*` route group.
   */
  async preview(ctx: HttpContext) {
    const { params, response } = ctx
    const id = String((params as Record<string, unknown>).id ?? '')
    const page = await Page.query().where('id', id).whereNull('deleted_at').first()
    if (!page) {
      return response.notFound('Page not found')
    }
    return this.composeAndRender(page, ctx, true)
  }

  /**
   * Shared render path for `show` (public) and `preview` (admin). Composes the
   * page with its layout/header/footer + referenced templates + bound collections
   * + site-wide code/meta, then renders the SSR/CSR component. In preview mode the
   * SSG cache is bypassed (always fresh, `no-store`).
   */
  private async composeAndRender(page: Page, ctx: HttpContext, preview: boolean) {
    const { request, inertia, response } = ctx
    const isInertiaVisit = Boolean(request.header('x-inertia'))

    // Render mode → component + caching. SSR/SSG use the SSR-allowlisted component;
    // CSR stays client-rendered. Preview is always uncached.
    const component = page.renderMode === 'CSR' ? 'public/page' : 'public/page_ssr'
    if (preview) {
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
      ? (await templatesService.find(page.layoutId).catch(() => null))?.content ?? null
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

    // Resolve every TemplateRef referenced across the composed docs into a
    // `{ [templateId]: content }` map (recursive, cycle/depth guarded).
    const templates = await templatesService.resolveRefs([
      page.content,
      layoutContent,
      headerContent,
      footerContent,
    ])

    // SSR/SSG: resolve bound collection records server-side so they appear in the
    // initial HTML (CSR pages resolve on the client). Includes collections inside
    // the layout/header/footer and any referenced templates.
    const collections =
      page.renderMode === 'CSR'
        ? undefined
        : await resolvePageCollections([
            page.content,
            layoutContent,
            headerContent,
            footerContent,
            ...Object.values(templates),
          ])

    // Site-wide custom code + meta tags (injected on every public/preview page).
    const [globalCode, globalMeta] = await Promise.all([
      webSettingsService.getGlobalCode(),
      webSettingsService.getSiteMetaTags(),
    ])

    const result = await renderPage(inertia, component, {
      page: {
        title: page.title,
        path: page.path,
        content: page.content,
        seo: page.seo,
        layout: layoutContent,
        header: headerContent ?? undefined,
        footer: footerContent ?? undefined,
        templates,
        collections,
        globalCode,
        globalMeta,
        preview,
      },
    })

    // SSG: snapshot the rendered HTML for subsequent requests (full loads only).
    // Never cache a preview render.
    if (!preview && page.renderMode === 'SSG' && !isInertiaVisit && typeof result === 'string') {
      await pagesService.cacheRenderedHtml(page.id, result)
    }

    return result
  }
}
