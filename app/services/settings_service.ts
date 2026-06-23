import crypto from 'node:crypto'
import env from '#start/env'
import WebSetting from '#models/web_setting'
import IntegrationSetting from '#models/integration_setting'
import { newUlid } from '#services/ulid_service'

const WEB_DEFAULTS: Record<string, Record<string, string>> = {
  auth_pages: {
    background_url: '',
    logo_url: '',
  },
  site_meta: {
    site_title: 'Driftless',
    site_description: 'A modern CMS',
    favicon_url: '/logo.svg',
  },
  // App configuration toggles (managed from Settings → Application).
  app_config: {
    landing_enabled: '1', // '0' hides the public landing/posts (dashboard-only)
    hidden_nav: '', // comma-separated core sidebar nav titles to hide
  },
}

function encryptSecret(plain: string): string {
  const key = crypto.scryptSync(env.get('APP_KEY').release(), 'salt', 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(enc: string): string | null {
  try {
    const [ivHex, encHex] = enc.split(':')
    if (!ivHex || !encHex) return null
    const key = crypto.scryptSync(env.get('APP_KEY').release(), 'salt', 32)
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

function maskSecret(val: string | null): string | null {
  if (!val) return null
  if (val.length <= 8) return '••••••••'
  return `${val.slice(0, 4)}${'•'.repeat(Math.min(8, val.length - 8))}${val.slice(-4)}`
}

export interface WebsiteSettingsDto {
  sections: Record<string, Record<string, string>>
  updatedAt: string
}

export interface PublicWebAppearance {
  authBackgroundUrl: string
  authLogoUrl: string
  siteTitle: string
  siteDescription: string
  faviconUrl: string
}

export interface IntegrationSettingsAdmin {
  googleAuthEnabled: boolean
  googleClientId: string | null
  googleClientSecretMasked: string | null
  hasGoogleClientSecretInDb: boolean
  googleRedirectUriHint: string
  envGoogleOAuthFallback: boolean
  captchaEnabled: boolean
  captchaProvider: string | null
  captchaSiteKey: string | null
  captchaSecretMasked: string | null
  hasCaptchaSecretInDb: boolean
  captchaOnLogin: boolean
  captchaOnRegister: boolean
  envCaptchaFallback: boolean
  ga4Enabled: boolean
  ga4MeasurementId: string | null
  envGa4Fallback: boolean
  clarityEnabled: boolean
  clarityProjectId: string | null
  envClarityFallback: boolean
  updatedAt: string
}

export interface AuthPublicConfig {
  google: { enabled: boolean; configured: boolean }
  captcha: {
    enabled: boolean
    provider: string | null
    siteKey: string | null
    onLogin: boolean
    onRegister: boolean
  }
  analytics: {
    googleAnalytics: { enabled: boolean; measurementId: string | null }
    microsoftClarity: { enabled: boolean; projectId: string | null }
  }
  web: PublicWebAppearance
}

export class WebSettingsService {
  async getMergedSections(): Promise<Record<string, Record<string, string>>> {
    const rows = await WebSetting.query().whereNull('deleted_at')
    const sections: Record<string, Record<string, string>> = {}

    for (const [sec, defaults] of Object.entries(WEB_DEFAULTS)) {
      sections[sec] = { ...defaults }
    }

    for (const row of rows) {
      if (!sections[row.section]) sections[row.section] = {}
      sections[row.section]![row.key] = row.value
    }

    return sections
  }

  async getDto(): Promise<WebsiteSettingsDto> {
    const rows = await WebSetting.query().whereNull('deleted_at')
    const sections = await this.getMergedSections()
    const latestAt = rows.reduce<Date | null>((acc, r) => {
      const d = r.updatedAt.toJSDate()
      return !acc || d > acc ? d : acc
    }, null)
    return { sections, updatedAt: (latestAt ?? new Date(0)).toISOString() }
  }

  async getPublicAppearance(): Promise<PublicWebAppearance> {
    const sections = await this.getMergedSections()
    return this.mapPublicAppearance(sections)
  }

  mapPublicAppearance(sections: Record<string, Record<string, string>>): PublicWebAppearance {
    const auth = sections['auth_pages'] ?? WEB_DEFAULTS['auth_pages'] ?? {}
    const meta = sections['site_meta'] ?? WEB_DEFAULTS['site_meta'] ?? {}
    return {
      authBackgroundUrl: auth['background_url']?.trim() || '',
      authLogoUrl: auth['logo_url']?.trim() || '',
      siteTitle: meta['site_title']?.trim() || 'Driftless',
      siteDescription: meta['site_description']?.trim() || '',
      faviconUrl: meta['favicon_url']?.trim() || '/logo.svg',
    }
  }

  async applyPatches(
    patches: Array<{ section: string; key: string; value: string }>
  ): Promise<WebsiteSettingsDto> {
    for (const p of patches) {
      const value = String(p.value ?? '')
      const existing = await WebSetting.query()
        .where('section', p.section)
        .where('key', p.key)
        .whereNull('deleted_at')
        .first()

      if (value === '') {
        // Empty = reset to the in-memory default; drop the override row so we
        // never persist an empty string (and re-toggling can't conflict).
        if (existing) await existing.delete()
        continue
      }

      if (existing) {
        existing.value = value
        await existing.save()
      } else {
        await WebSetting.create({
          id: newUlid(),
          section: p.section,
          key: p.key,
          value,
        })
      }
    }
    return this.getDto()
  }

  /** App-level toggles (landing on/off + hidden sidebar nav) for any admin. */
  async getAppConfig(): Promise<{ landingEnabled: boolean; hiddenNav: string[] }> {
    const sections = await this.getMergedSections()
    const cfg = sections['app_config'] ?? {}
    return {
      landingEnabled: (cfg['landing_enabled'] ?? '1') !== '0',
      hiddenNav: (cfg['hidden_nav'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }
  }
}

export class IntegrationSettingsService {
  async getOrCreate(): Promise<IntegrationSetting> {
    const existing = await IntegrationSetting.find('default')
    if (existing) return existing
    return IntegrationSetting.create({ id: 'default' })
  }

  buildGoogleRedirectUri(): string {
    const port = env.get('PORT', 3333)
    const base = env.get('APP_URL', `http://localhost:${port}`)
    return `${base}/auth/google/callback`
  }

  async resolveGoogleOAuth(): Promise<{
    clientId: string
    clientSecret: string
    redirectUri: string
  } | null> {
    const row = await this.getOrCreate()
    if (!row.googleAuthEnabled) return null

    const clientId = row.googleClientId?.trim() || env.get('GOOGLE_CLIENT_ID', '')
    let clientSecret: string | null = null
    if (row.googleClientSecretEnc) {
      clientSecret = decryptSecret(row.googleClientSecretEnc)
    }
    if (!clientSecret) {
      clientSecret = env.get('GOOGLE_CLIENT_SECRET', '') || null
    }
    if (!clientId || !clientSecret) return null
    return { clientId, clientSecret, redirectUri: this.buildGoogleRedirectUri() }
  }

  async getAuthPublicConfig(): Promise<AuthPublicConfig> {
    const row = await this.getOrCreate()
    const google = await this.resolveGoogleOAuth()
    const captchaOk =
      row.captchaEnabled && !!(row.captchaSiteKey || env.get('TURNSTILE_SITE_KEY', ''))
    const siteKey = captchaOk ? row.captchaSiteKey || env.get('TURNSTILE_SITE_KEY', '') : null
    const provider = captchaOk ? row.captchaProvider || 'turnstile' : null

    const webSvc = new WebSettingsService()
    const web = await webSvc.getPublicAppearance()

    return {
      google: { enabled: !!google, configured: !!google },
      captcha: {
        enabled: captchaOk,
        provider,
        siteKey,
        onLogin: captchaOk && row.captchaOnLogin,
        onRegister: captchaOk && row.captchaOnRegister,
      },
      analytics: {
        googleAnalytics: {
          enabled: row.ga4Enabled && !!(row.ga4MeasurementId || env.get('GA4_MEASUREMENT_ID', '')),
          measurementId: row.ga4Enabled
            ? row.ga4MeasurementId || env.get('GA4_MEASUREMENT_ID', '') || null
            : null,
        },
        microsoftClarity: {
          enabled:
            row.clarityEnabled && !!(row.clarityProjectId || env.get('CLARITY_PROJECT_ID', '')),
          projectId: row.clarityEnabled
            ? row.clarityProjectId || env.get('CLARITY_PROJECT_ID', '') || null
            : null,
        },
      },
      web,
    }
  }

  async getAdminSettings(): Promise<IntegrationSettingsAdmin> {
    const row = await this.getOrCreate()
    const googleSecretPlain = row.googleClientSecretEnc
      ? decryptSecret(row.googleClientSecretEnc)
      : null
    const captchaSecretPlain = row.captchaSecretEnc ? decryptSecret(row.captchaSecretEnc) : null

    return {
      googleAuthEnabled: row.googleAuthEnabled,
      googleClientId: row.googleClientId,
      googleClientSecretMasked: maskSecret(googleSecretPlain),
      hasGoogleClientSecretInDb: !!googleSecretPlain,
      googleRedirectUriHint: this.buildGoogleRedirectUri(),
      envGoogleOAuthFallback: !!(
        env.get('GOOGLE_CLIENT_ID', '') && env.get('GOOGLE_CLIENT_SECRET', '')
      ),
      captchaEnabled: row.captchaEnabled,
      captchaProvider: row.captchaProvider,
      captchaSiteKey: row.captchaSiteKey,
      captchaSecretMasked: maskSecret(captchaSecretPlain),
      hasCaptchaSecretInDb: !!captchaSecretPlain,
      captchaOnLogin: row.captchaOnLogin,
      captchaOnRegister: row.captchaOnRegister,
      envCaptchaFallback: !!(env.get('TURNSTILE_SITE_KEY', '') || env.get('HCAPTCHA_SITE_KEY', '')),
      ga4Enabled: row.ga4Enabled,
      ga4MeasurementId: row.ga4MeasurementId,
      envGa4Fallback: !!env.get('GA4_MEASUREMENT_ID', ''),
      clarityEnabled: row.clarityEnabled,
      clarityProjectId: row.clarityProjectId,
      envClarityFallback: !!env.get('CLARITY_PROJECT_ID', ''),
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  async update(
    dto: Partial<{
      googleAuthEnabled: boolean
      googleClientId: string | null
      googleClientSecret: string | null
      captchaEnabled: boolean
      captchaProvider: string | null
      captchaSiteKey: string | null
      captchaSecret: string | null
      captchaOnLogin: boolean
      captchaOnRegister: boolean
      ga4Enabled: boolean
      ga4MeasurementId: string | null
      clarityEnabled: boolean
      clarityProjectId: string | null
    }>
  ): Promise<IntegrationSettingsAdmin> {
    const row = await this.getOrCreate()

    if (dto.googleAuthEnabled !== undefined) row.googleAuthEnabled = dto.googleAuthEnabled
    if (dto.googleClientId !== undefined) row.googleClientId = dto.googleClientId?.trim() || null
    if (dto.googleClientSecret !== undefined) {
      row.googleClientSecretEnc = dto.googleClientSecret?.trim()
        ? encryptSecret(dto.googleClientSecret.trim())
        : null
    }
    if (dto.captchaEnabled !== undefined) row.captchaEnabled = dto.captchaEnabled
    if (dto.captchaProvider !== undefined) row.captchaProvider = dto.captchaProvider?.trim() || null
    if (dto.captchaSiteKey !== undefined) row.captchaSiteKey = dto.captchaSiteKey?.trim() || null
    if (dto.captchaSecret !== undefined) {
      row.captchaSecretEnc = dto.captchaSecret?.trim()
        ? encryptSecret(dto.captchaSecret.trim())
        : null
    }
    if (dto.captchaOnLogin !== undefined) row.captchaOnLogin = dto.captchaOnLogin
    if (dto.captchaOnRegister !== undefined) row.captchaOnRegister = dto.captchaOnRegister
    if (dto.ga4Enabled !== undefined) row.ga4Enabled = dto.ga4Enabled
    if (dto.ga4MeasurementId !== undefined)
      row.ga4MeasurementId = dto.ga4MeasurementId?.trim() || null
    if (dto.clarityEnabled !== undefined) row.clarityEnabled = dto.clarityEnabled
    if (dto.clarityProjectId !== undefined)
      row.clarityProjectId = dto.clarityProjectId?.trim() || null

    await row.save()
    return this.getAdminSettings()
  }
}
