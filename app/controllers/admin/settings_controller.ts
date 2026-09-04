import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { WebSettingsService, IntegrationSettingsService } from '#services/settings_service'
import PagesService from '#services/pages_service'
import { renderPage } from '#helpers/inertia_render'

const webSettingsService = new WebSettingsService()
const integrationService = new IntegrationSettingsService()
const pagesService = new PagesService()

/**
 * Type-checks the integration payload before it reaches the service. Without
 * this, a bad type (e.g. a number where a string is expected) hit `.trim()` in
 * the service and threw an unhandled 500; booleans could arrive as strings.
 * Every field is optional — the service only writes keys that are present.
 */
const updateIntegrationValidator = vine.compile(
  vine.object({
    googleAuthEnabled: vine.boolean().optional(),
    googleClientId: vine.string().trim().nullable().optional(),
    googleClientSecret: vine.string().trim().nullable().optional(),
    captchaEnabled: vine.boolean().optional(),
    captchaProvider: vine.string().trim().nullable().optional(),
    captchaSiteKey: vine.string().trim().nullable().optional(),
    captchaSecret: vine.string().trim().nullable().optional(),
    captchaOnLogin: vine.boolean().optional(),
    captchaOnRegister: vine.boolean().optional(),
    ga4Enabled: vine.boolean().optional(),
    ga4MeasurementId: vine.string().trim().nullable().optional(),
    clarityEnabled: vine.boolean().optional(),
    clarityProjectId: vine.string().trim().nullable().optional(),
  })
)

export default class SettingsController {
  // Web settings
  async getWebSettings({ response }: HttpContext) {
    const settings = await webSettingsService.getDto()
    return response.json(settings)
  }

  async updateWebSettings({ request, response }: HttpContext) {
    const { patches } = request.all()
    if (!Array.isArray(patches)) {
      return response.status(422).json({ message: '`patches` must be an array.' })
    }
    try {
      const settings = await webSettingsService.applyPatches(patches)
      // The theme (font/colours) is baked into SSG snapshots via shared props →
      // re-render cached HTML when it changes.
      if (patches.some((p) => p && typeof p === 'object' && p.section === 'theme')) {
        await pagesService.invalidateAllSnapshots()
      }
      return response.json(settings)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  // Global (site-wide) custom code — CSS/JS injected on every published page.
  async getPageCode({ response }: HttpContext) {
    const snippets = await webSettingsService.getGlobalCode()
    return response.json({ snippets })
  }

  async updatePageCode({ request, response }: HttpContext) {
    const { snippets } = request.all()
    const saved = await webSettingsService.setGlobalCode(snippets)
    // Site-wide code changes affect every public page → bust SSG snapshots so
    // cached HTML is re-rendered with the new code.
    await pagesService.invalidateAllSnapshots()
    return response.json({ snippets: saved })
  }

  // Site-wide responsive breakpoints (Webflow-style tiers + custom resolutions).
  async getBreakpoints({ response }: HttpContext) {
    return response.json({ breakpoints: await webSettingsService.getBreakpoints() })
  }

  async updateBreakpoints({ request, response }: HttpContext) {
    const { breakpoints } = request.all()
    const saved = await webSettingsService.setBreakpoints(breakpoints)
    // The tier list changes the `@media` CSS baked into every SSG page.
    await pagesService.invalidateAllSnapshots()
    return response.json({ breakpoints: saved })
  }

  // Integration settings
  async getIntegrationSettings({ response }: HttpContext) {
    const settings = await integrationService.getAdminSettings()
    return response.json(settings)
  }

  async updateIntegrationSettings({ request, response }: HttpContext) {
    const dto = await request.validateUsing(updateIntegrationValidator)
    try {
      const settings = await integrationService.update(dto)
      return response.json(settings)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async getAuthConfig({ response }: HttpContext) {
    const config = await integrationService.getAuthPublicConfig()
    return response.json(config)
  }

  /** App toggles for any admin (landing on/off + hidden sidebar nav). */
  async navConfig({ response }: HttpContext) {
    const cfg = await webSettingsService.getAppConfig()
    return response.json(cfg)
  }

  // Pages
  async settingsPage({ inertia }: HttpContext) {
    return inertia.render('admin/settings', {})
  }

  /**
   * Admin-shell branding, the sign-in screens, and the built-in-page overrides.
   *
   * Moved off the Settings hub, which was a hub and an editor at once.
   */
  async appearanceSettingsPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'admin/settings/appearance', {})
  }

  /** Public website settings — site/SEO + global meta tags + global custom code. */
  async websiteSettingsPage({ inertia }: HttpContext) {
    return inertia.render('admin/website-settings', {})
  }

  /** Public site on/off and which core sidebar menus are visible. */
  async generalSettingsPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'admin/settings/general', {})
  }

  /** The module manager — apps and plugins. */
  async applicationSettingsPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'admin/settings/application', {})
  }

  async integrationsPage({ inertia }: HttpContext) {
    return inertia.render('admin/integrations', {})
  }

  async integrationsGooglePage({ inertia }: HttpContext) {
    return inertia.render('admin/integrations/google', {})
  }

  async integrationsCaptchaPage({ inertia }: HttpContext) {
    return inertia.render('admin/integrations/captcha', {})
  }

  async integrationsGaPage({ inertia }: HttpContext) {
    return inertia.render('admin/integrations/google-analytics', {})
  }

  async integrationsClarityPage({ inertia }: HttpContext) {
    return inertia.render('admin/integrations/clarity', {})
  }

  /**
   * Personal access tokens for `/api/v1`.
   *
   * Lives under `/admin/settings/*`, not `/admin/integrations/*`, and the move
   * was a bug fix rather than tidying: the old path matched the `Integrations`
   * prefix in `nav_enabled_middleware`, so hiding that menu 404'd this page —
   * a page the Settings hub presents under "Developer & API", with nothing to
   * suggest the two were connected.
   */
  async apiTokensPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'admin/settings/api-tokens', {})
  }
}
