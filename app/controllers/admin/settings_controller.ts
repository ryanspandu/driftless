import type { HttpContext } from '@adonisjs/core/http'
import { WebSettingsService, IntegrationSettingsService } from '#services/settings_service'
import { renderPage } from '#helpers/inertia_render'

const webSettingsService = new WebSettingsService()
const integrationService = new IntegrationSettingsService()

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
      return response.json(settings)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  // Integration settings
  async getIntegrationSettings({ response }: HttpContext) {
    const settings = await integrationService.getAdminSettings()
    return response.json(settings)
  }

  async updateIntegrationSettings({ request, response }: HttpContext) {
    const dto = request.all()
    const settings = await integrationService.update(dto)
    return response.json(settings)
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

  async integrationsApiTokensPage({ inertia }: HttpContext) {
    return inertia.render('admin/integrations/api-tokens', {})
  }
}
