import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'
import PagesService from '#services/pages_service'
import TemplatesService from '#services/templates_service'
import { resolvePageCollections } from '#services/page_data_resolver'
import { renderPage } from '#helpers/inertia_render'

const pagesService = new PagesService()
const templatesService = new TemplatesService()

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

export default class PagesPublicController {
  /** Catch-all renderer for published builder pages, matched by `path`. */
  async show({ params, request, inertia, response }: HttpContext) {
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

    // Render mode → component + caching. SSR/SSG use the SSR-allowlisted
    // component; CSR stays client-rendered. SSG adds a static-like cache header.
    const isInertiaVisit = Boolean(request.header('x-inertia'))

    // SSG: serve the cached HTML snapshot on full page loads when present.
    if (
      page.renderMode === 'SSG' &&
      !isInertiaVisit &&
      typeof page.renderedHtml === 'string' &&
      page.renderedHtml.length > 0
    ) {
      response.header('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
      return response.header('Content-Type', 'text/html; charset=utf-8').send(page.renderedHtml)
    }

    const component = page.renderMode === 'CSR' ? 'public/page' : 'public/page_ssr'
    if (page.renderMode === 'SSG') {
      response.header('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
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
      },
    })

    // SSG: snapshot the rendered HTML for subsequent requests (full loads only).
    if (page.renderMode === 'SSG' && !isInertiaVisit && typeof result === 'string') {
      await pagesService.cacheRenderedHtml(page.id, result)
    }

    return result
  }
}
