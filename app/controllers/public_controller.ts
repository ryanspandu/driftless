import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import ContentTagService from '#services/content_tag_service'
import { IntegrationSettingsService, WebSettingsService } from '#services/settings_service'
import AuthPageOverrideService from '#services/auth_page_override_service'
import ModulesService from '#services/modules_service'
import PageRenderer from '#services/page_renderer'
import { abilityAllowsCode, collectUserPermissions } from '#services/permission_ability_service'
import { renderPage } from '#helpers/inertia_render'

const contentService = new ContentService()
const contentCategoryService = new ContentCategoryService()
const contentTagService = new ContentTagService()
const integrationService = new IntegrationSettingsService()
const webSettingsService = new WebSettingsService()
const overrides = new AuthPageOverrideService()
const modules = new ModulesService()
const renderer = new PageRenderer()

/** Signed cookie listing the post ids this visitor has unlocked with a password. */
const UNLOCK_COOKIE = 'dl_unlocked'

function readUnlockedIds(request: HttpContext['request']): string[] {
  const raw = request.cookie(UNLOCK_COOKIE) as { ids?: unknown } | undefined
  const ids = raw?.ids
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
}

export default class PublicController {
  async home(ctx: HttpContext) {
    const { inertia, response, auth } = ctx
    const { landingEnabled } = await webSettingsService.getAppConfig()
    if (!landingEnabled) {
      return response.redirect(auth.user ? '/admin/dashboard' : '/login')
    }
    /**
     * A designated builder page renders at `/` when one is set (Pages dashboard
     * → "Use as page → Front page", or Settings → Appearance); otherwise the
     * built-in static landing. `skipSnapshot` because it is served at `/`, not
     * at the page's own path — mirroring the auth/error overrides.
     */
    const front = await overrides.resolve('home')
    if (front) {
      return renderer.render(front, ctx, { skipSnapshot: true })
    }
    const posts = await contentService.findPublishedList()
    const authConfig = await integrationService.getAuthPublicConfig()
    return renderPage(inertia, 'home', { posts, authConfig })
  }

  async post(ctx: HttpContext) {
    const { params, inertia, response, auth } = ctx
    const { landingEnabled } = await webSettingsService.getAppConfig()
    if (!landingEnabled) {
      return response.redirect(auth.user ? '/admin/dashboard' : '/login')
    }

    const meta = await contentService.findAccessMetaBySlug(params.slug)
    if (!meta) return response.status(404).send('Post not found')

    // The gate decides whether the body may ship. A locked post is rendered with
    // its body withheld server-side (findPublishedBySlug(slug, false)) plus a
    // `locked` flag the page turns into a password form / members-only panel.
    const locked = await this.lockFor(ctx, meta)
    const post = await contentService.findPublishedBySlug(params.slug, locked === null)
    return renderPage(inertia, 'posts/show', { post, locked })
  }

  /**
   * `POST /posts/:slug/unlock` — verify a Protected post's password and, on
   * success, remember it in a signed cookie so the body ships on the next load.
   */
  async unlock({ params, request, response, session }: HttpContext) {
    const password = String(request.input('password', ''))
    const ok = await contentService.verifyPostPassword(params.slug, password)
    if (!ok) {
      session.flash('errors', { password: 'That password is incorrect.' })
      return response.redirect().back()
    }
    const meta = await contentService.findAccessMetaBySlug(params.slug)
    const ids = readUnlockedIds(request)
    if (meta && !ids.includes(meta.id)) ids.push(meta.id)
    response.cookie(UNLOCK_COOKIE, { ids }, { httpOnly: true, sameSite: 'lax', maxAge: '7days' })
    return response.redirect(`/posts/${params.slug}`)
  }

  /**
   * Returns null when the visitor may read the post, otherwise the reason the
   * page should show (`password` or `member`). Admins bypass every gate.
   */
  private async lockFor(
    ctx: HttpContext,
    meta: { id: string; visibility: 'PUBLIC' | 'PROTECTED' | 'MEMBER' }
  ): Promise<{ type: 'password' | 'member' } | null> {
    if (meta.visibility === 'PUBLIC') return null
    if (await this.isAdminViewer(ctx)) return null

    if (meta.visibility === 'PROTECTED') {
      return readUnlockedIds(ctx.request).includes(meta.id) ? null : { type: 'password' }
    }
    // MEMBER
    return (await this.isMember(ctx)) ? null : { type: 'member' }
  }

  /** A logged-in admin who can read content — bypasses gates (also covers preview). */
  private async isAdminViewer({ auth }: HttpContext): Promise<boolean> {
    const user = auth.user as User | undefined
    if (!user) return false
    await user.load('roles', (q) => q.preload('permissions'))
    return abilityAllowsCode(collectUserPermissions(user), 'content:read')
  }

  /** A "member" is any logged-in core user OR (if the store is on) a signed-in customer. */
  private async isMember(ctx: HttpContext): Promise<boolean> {
    if (ctx.auth.user) return true
    if (await modules.isEnabled('ecommerce')) {
      // Dynamic import so core keeps no static dependency on the module.
      const { default: AccountAuthService } = await import(
        '#modules/ecommerce/services/account_auth_service'
      )
      const account = await new AccountAuthService().resolve(ctx)
      if (account) return true
    }
    return false
  }

  async category(ctx: HttpContext) {
    const { params, inertia, response, auth } = ctx
    const { landingEnabled } = await webSettingsService.getAppConfig()
    if (!landingEnabled) {
      return response.redirect(auth.user ? '/admin/dashboard' : '/login')
    }
    const category = await contentCategoryService.findRefBySlug(params.slug)
    if (!category) {
      return response.status(404).send('Category not found')
    }

    // An operator can assign a builder page as the archive template ("Use as
    // page → Category archive"); otherwise the built-in Inertia archive shows.
    const override = await overrides.resolve('categoryArchive')
    if (override) {
      return renderer.render(override, ctx, {
        bindings: { params: { slug: category.slug, kind: 'category' } },
        seoOverride: { title: category.name, canonicalPath: `/category/${category.slug}` },
        skipSnapshot: true,
      })
    }

    const rows = await contentCategoryService.publishedPostsInCategory(params.slug)
    const posts = rows.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      visibility: p.visibility,
      featuredImage: p.featuredImage ?? null,
      updatedAt: p.updatedAt.toISO(),
    }))
    return renderPage(inertia, 'posts/category', { category, posts })
  }

  async tag(ctx: HttpContext) {
    const { params, inertia, response, auth } = ctx
    const { landingEnabled } = await webSettingsService.getAppConfig()
    if (!landingEnabled) {
      return response.redirect(auth.user ? '/admin/dashboard' : '/login')
    }
    const tag = await contentTagService.findRefBySlug(params.slug)
    if (!tag) {
      return response.status(404).send('Tag not found')
    }

    const override = await overrides.resolve('tagArchive')
    if (override) {
      return renderer.render(override, ctx, {
        bindings: { params: { slug: tag.slug, kind: 'tag' } },
        seoOverride: { title: tag.name, canonicalPath: `/tag/${tag.slug}` },
        skipSnapshot: true,
      })
    }

    const rows = await contentTagService.publishedPostsInTag(params.slug)
    const posts = rows.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      visibility: p.visibility,
      featuredImage: p.featuredImage ?? null,
      updatedAt: p.updatedAt.toISO(),
    }))
    return renderPage(inertia, 'posts/tag', { tag, posts })
  }

  async offline({ inertia }: HttpContext) {
    return inertia.render('offline', {})
  }
}
