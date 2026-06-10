import type { HttpContext } from '@adonisjs/core/http'
import { WebSettingsService, IntegrationSettingsService } from '#services/settings_service'

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
    const settings = await webSettingsService.applyPatches(patches)
    return response.json(settings)
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

  // Pages
  async settingsPage({ inertia }: HttpContext) {
    return inertia.render('admin/settings', {})
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
}
