import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'
import PageRenderer, { SSG_CACHE, CSP_NONCE_SENTINEL } from '#services/page_renderer'
import { currentBuildId } from '#services/release'
import { reservedFirstSegment } from '#services/reserved_paths'
import RedirectsService from '#services/redirects_service'
import PagesService from '#services/pages_service'
import { findFilePageByPath, virtualPageForFilePage } from '#services/file_pages'
import TemplateKitsService from '#services/template_kits_service'
import { WebSettingsService } from '#services/settings_service'
import ContentPathsService from '#services/content_paths_service'
import CollectionDetailService from '#services/collection_detail_service'
import { blogSearchThrottle } from '#start/limiter'

const renderer = new PageRenderer()
const redirects = new RedirectsService()
const pagesService = new PagesService()
const templateKits = new TemplateKitsService()
const webSettingsService = new WebSettingsService()
const contentPaths = new ContentPathsService()
const collectionDetails = new CollectionDetailService()

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

    if (!path || reservedFirstSegment(path)) {
      pageNotFound()
    }

    const page = await Page.query()
      .where('path', path)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()

    if (!page) {
      // No DB page (which always wins). Next, a file-page — a route that lives in
      // a kit as code with no database row. Rendered through the same code-page
      // pipeline via a transient, unsaved Page.
      const filePage = findFilePageByPath(path, await templateKits.activeSet())
      if (filePage) {
        return this.composeAndRender(virtualPageForFilePage(filePage), ctx, false)
      }

      // The Content screens (blog archive, post, category, tag) at the prefixes
      // the operator configured (Website settings → URLs). A page or file-page on
      // the same path already won above; content beats a redirect.
      const content = await contentPaths.match(path)
      if (content) {
        try {
          return await this.renderContentScreen(content, ctx)
        } catch (e) {
          // "No such post/category/tag" must not end the lookup here: an old slug
          // may have a redirect, and a manual 301 under the blog prefix must work.
          if ((e as { code?: string }).code !== 'E_PAGE_NOT_FOUND') throw e
        }
      }

      // A collection's public detail page (`/<prefix>/<slug>`), rendered through
      // its template page. Same precedence as the content screens: a page
      // above wins, a record beats a redirect. A lookup failure (e.g. the
      // migration has not run yet) is "no such page", never a 500 on a public URL.
      const detail = await collectionDetails.resolve(path).catch(() => null)
      if (detail) {
        return renderer.render(detail.page, ctx, detail.options)
      }

      // Before giving up, honour a configured redirect (e.g. a moved page's old
      // URL). Keeps inbound links and ranking alive instead of 404-ing.
      const hit = await redirects.resolve(path).catch(() => null)
      if (hit) {
        void redirects.recordHit(hit.id)
        return response
          .redirect()
          .status(hit.status === 302 ? 302 : 301)
          .toPath(hit.toPath)
      }
      pageNotFound()
    }

    // A DB page built on a kit single-template (`kit:<id>`) hides with its kit:
    // an inactive kit's pages 404 publicly, matching the admin Pages list.
    const pageKit = page.component?.startsWith('kit:') ? page.component.slice(4) : null
    if (pageKit && !(await templateKits.activeSet()).has(pageKit)) {
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
      // Re-nonce the frozen snapshot to this request's nonce so its `<style>`/
      // `<script>` elements match the fresh CSP header Shield set for this response.
      const nonce = response.nonce
      const html = nonce
        ? page.renderedHtml.replaceAll(CSP_NONCE_SENTINEL, nonce)
        : page.renderedHtml
      response.header('Cache-Control', SSG_CACHE)
      // This branch serves a pre-rendered snapshot and bypasses
      // PageRenderer.render() entirely, so the site-wide noindex header (a
      // live response property, unlike the meta tag baked into the snapshot
      // HTML) has to be set here too.
      if (await webSettingsService.getDiscourageIndexing()) {
        response.header('X-Robots-Tag', 'noindex, nofollow')
      }
      return response.header('Content-Type', 'text/html; charset=utf-8').send(html)
    }

    return this.composeAndRender(page, ctx, false)
  }

  /**
   * Public **share preview** by unguessable token: renders the page (draft
   * included, staged draft content if present) at any status, uncached and
   * never indexed. Lets a stakeholder without a login see work in progress.
   */
  async previewByToken(ctx: HttpContext) {
    const { params, response } = ctx
    const token = String((params as Record<string, unknown>).token ?? '')
    const page = await pagesService.findByPreviewToken(token)
    if (!page) {
      pageNotFound()
    }
    // Show the staged draft when there is one, so the link previews unpublished work.
    if (page.draftContent != null) {
      page.content = page.draftContent
      if (page.draftSeo != null) page.seo = page.draftSeo
    }
    response.header('X-Robots-Tag', 'noindex, nofollow')
    return renderer.render(page, ctx, { preview: true })
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
      pageNotFound()
    }
    // Show staged edits when there are any, so the Preview link (and the
    // simplified content-fields editor's live iframe) reflects what's on
    // screen, not just what was last published — mirrors `previewByToken`.
    if (page.draftContent != null) {
      page.content = page.draftContent
      if (page.draftSeo != null) page.seo = page.draftSeo
    }
    if (page.draftContentFields != null) {
      page.contentFields = page.draftContentFields
    }
    // Shield denies ALL framing by default (clickjacking hardening, config/shield.ts).
    // This route is auth-gated (the `/admin/*` group) and only ever framed by our
    // own admin UI (the content-fields editor's live preview) — relax just enough
    // for that same-origin case, not third-party embedding.
    response.header('X-Frame-Options', 'SAMEORIGIN')
    const csp = response.getHeader('Content-Security-Policy')
    if (typeof csp === 'string') {
      response.header(
        'Content-Security-Policy',
        csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
      )
    }
    return this.composeAndRender(page, ctx, true)
  }

  /**
   * Hand a catch-all hit on a configured Content prefix to the same handler the
   * historical route uses (they read `params.slug` and the request URL). Routes
   * are frozen at boot, so the per-route throttle is applied by hand.
   */
  private async renderContentScreen(
    match: { kind: 'archive' | 'detail' | 'category' | 'tag'; slug?: string },
    ctx: HttpContext
  ) {
    if (match.kind !== 'detail') {
      await blogSearchThrottle(ctx, async () => {})
    }
    const { default: PublicController } = await import('#controllers/public_controller')
    const controller = new PublicController()
    ctx.params = { ...ctx.params, slug: match.slug }
    if (match.kind === 'archive') return controller.blog(ctx)
    if (match.kind === 'detail') return controller.post(ctx)
    if (match.kind === 'category') return controller.category(ctx)
    return controller.tag(ctx)
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
