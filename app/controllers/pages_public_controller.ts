import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'
import PageRenderer, { SSG_CACHE } from '#services/page_renderer'
import { currentBuildId } from '#services/release'
import { allReservedSegments } from '#modules/registry'

const renderer = new PageRenderer()

/**
 * Route prefixes that must never be treated as a builder page path.
 *
 * Core's own, plus whatever the installed modules claim — a module registers
 * its routes before this catch-all, so a page authored at `/shop/...` would be
 * permanently shadowed rather than merely wrong. Modules contribute through
 * `reservedSegments` so this list never has to name one.
 */
const RESERVED_FIRST_SEGMENT = new Set([
  ...allReservedSegments(),
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
  /** Affiliate referral links (`/ref/:code`), registered by the same module. */
  'ref',
])

/**
 * Signal "no such page" so the exception handler can shape the response.
 *
 * This must *throw* rather than `return response.notFound(...)`. This route is
 * the catch-all (`GET *`), so it is what an unmatched URL actually reaches —
 * including unmatched `/api/*` paths, since `api` is a reserved first segment.
 * Returning a response short-circuits the handler, which is why unknown pages
 * used to render bare text instead of the `errors/not_found` Inertia page, and
 * unknown API paths returned text instead of `{ message: 'Not found' }`.
 */
function pageNotFound(): never {
  throw new Exception('Page not found', { status: 404, code: 'E_PAGE_NOT_FOUND' })
}

export default class PagesPublicController {
  /** Catch-all renderer for PUBLISHED builder pages, matched by `path`. */
  async show(ctx: HttpContext) {
    const { params, request, response } = ctx
    const raw = (params as Record<string, unknown>)['*']
    const path = (Array.isArray(raw) ? raw.join('/') : String(raw ?? '')).replace(/^\/+|\/+$/g, '')

    if (!path || RESERVED_FIRST_SEGMENT.has(path.split('/')[0])) {
      pageNotFound()
    }

    const page = await Page.query()
      .where('path', path)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()

    if (!page) {
      pageNotFound()
    }

    /**
     * SSG: serve the cached HTML snapshot on full page loads when present **and
     * still valid for this build**.
     *
     * The snapshot has hashed asset URLs baked into it, so one written by an
     * earlier build points at chunks that may no longer exist — a page that
     * renders as an unstyled skeleton with a dead script tag. A stale stamp is
     * treated as a miss and re-rendered, which repairs it on the first hit.
     */
    const isInertiaVisit = Boolean(request.header('x-inertia'))
    if (
      page.renderMode === 'SSG' &&
      !isInertiaVisit &&
      typeof page.renderedHtml === 'string' &&
      page.renderedHtml.length > 0 &&
      page.renderedBuild === currentBuildId()
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
    const { params } = ctx
    const id = String((params as Record<string, unknown>).id ?? '')
    const page = await Page.query().where('id', id).whereNull('deleted_at').first()
    if (!page) {
      pageNotFound()
    }
    return this.composeAndRender(page, ctx, true)
  }

  /**
   * Delegates to {@link PageRenderer}, which owns the composition — layout,
   * header/footer, referenced templates, bound collections, block data and
   * site-wide code. Extracted so other routes can render a builder page too;
   * the e-commerce module's product template is the first.
   */
  private async composeAndRender(page: Page, ctx: HttpContext, preview: boolean) {
    return renderer.render(page, ctx, { preview })
  }
}
