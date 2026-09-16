import type { HttpContext } from '@adonisjs/core/http'
import { IntegrationSettingsService } from '#services/settings_service'

const integrationService = new IntegrationSettingsService()

/**
 * Public, module-agnostic CAPTCHA config — the one place any client (a
 * template-kit form, a storefront page, an admin auth page) fetches
 * `{enabled, provider, siteKey, on<Flow>}` from, regardless of which module
 * or page kind it's rendered in. `/api/auth/config` and `/api/shop/config`
 * nest this same shape for their own flows; this is the neutral entry point
 * for everything else.
 */
export default class CaptchaController {
  async config({ response }: HttpContext) {
    return response.json(await integrationService.getPublicCaptchaConfig())
  }
}
