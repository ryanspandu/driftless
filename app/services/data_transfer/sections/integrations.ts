import { IntegrationSettingsService } from '#services/settings_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Integration settings (the single-row `integration_settings` table): analytics
 * ids (GA4, Clarity), CAPTCHA provider/site-key + gating toggles, and the Google
 * OAuth client id. All non-secret and fully portable.
 *
 * The two encrypted secrets (`google_client_secret_enc`, `captcha_secret_enc`)
 * are APP_KEY-bound and never leave the source install — the operator re-enters
 * them on the target (a warning says so). Single-row config: upserted in place,
 * so no `tables` are declared (never wiped).
 */
export const integrationsSection: DataSection = {
  name: 'integrations',
  owner: 'core',
  order: 71,
  label: 'Integrations (analytics, CAPTCHA, OAuth)',

  async export() {
    const row = await new IntegrationSettingsService().getOrCreate()
    return {
      integrations: {
        googleAuthEnabled: row.googleAuthEnabled,
        googleAuthEnabledForShop: row.googleAuthEnabledForShop,
        googleClientId: row.googleClientId,
        captchaEnabled: row.captchaEnabled,
        captchaProvider: row.captchaProvider,
        captchaSiteKey: row.captchaSiteKey,
        captchaOnLogin: row.captchaOnLogin,
        captchaOnRegister: row.captchaOnRegister,
        captchaOnCheckout: row.captchaOnCheckout,
        ga4Enabled: row.ga4Enabled,
        ga4MeasurementId: row.ga4MeasurementId,
        clarityEnabled: row.clarityEnabled,
        clarityProjectId: row.clarityProjectId,
      },
    }
  },

  async import(ctx, data) {
    const report = emptyReport('integrations')
    const payload = (data ?? {}) as { integrations?: Record<string, unknown> }
    const i = payload.integrations
    if (!i) return report
    try {
      await new IntegrationSettingsService().update({
        googleAuthEnabled: !!i.googleAuthEnabled,
        googleAuthEnabledForShop: !!i.googleAuthEnabledForShop,
        googleClientId: (i.googleClientId as string) ?? null,
        captchaEnabled: !!i.captchaEnabled,
        captchaProvider: (i.captchaProvider as string) ?? null,
        captchaSiteKey: (i.captchaSiteKey as string) ?? null,
        captchaOnLogin: !!i.captchaOnLogin,
        captchaOnRegister: !!i.captchaOnRegister,
        captchaOnCheckout: !!i.captchaOnCheckout,
        ga4Enabled: !!i.ga4Enabled,
        ga4MeasurementId: (i.ga4MeasurementId as string) ?? null,
        clarityEnabled: !!i.clarityEnabled,
        clarityProjectId: (i.clarityProjectId as string) ?? null,
      })
      report.updated++
      if (i.googleAuthEnabled || i.captchaEnabled) {
        report.warnings.push(
          'Google/CAPTCHA secrets are not exported — re-enter them on the target install.'
        )
        ctx.log('integrations: secrets (OAuth/CAPTCHA) must be re-entered on the target')
      }
    } catch (e) {
      report.warnings.push(`integrations: ${(e as Error).message}`)
    }
    return report
  },
}
