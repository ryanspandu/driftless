import type { HttpContext } from '@adonisjs/core/http'
import ContentService from '#services/content_service'
import { IntegrationSettingsService, WebSettingsService } from '#services/settings_service'
import AuthPageOverrideService from '#services/auth_page_override_service'
import PageRenderer from '#services/page_renderer'
import { renderPage } from '#helpers/inertia_render'

const contentService = new ContentService()
const integrationService = new IntegrationSettingsService()
const webSettingsService = new WebSettingsService()
const overrides = new AuthPageOverrideService()
const renderer = new PageRenderer()

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

  async post({ params, inertia, response, auth }: HttpContext) {
    const { landingEnabled } = await webSettingsService.getAppConfig()
    if (!landingEnabled) {
      return response.redirect(auth.user ? '/admin/dashboard' : '/login')
    }
    const post = await contentService.findPublishedBySlug(params.slug)
    return renderPage(inertia, 'posts/show', { post })
  }

  async offline({ inertia }: HttpContext) {
    return inertia.render('offline', {})
  }
}
