import env from '#start/env'
import { decryptSecret } from '#services/settings_service'
import type IntegrationSetting from '#models/integration_setting'

const CAPTCHA_PROVIDER_IDS = ['turnstile', 'hcaptcha', 'recaptcha'] as const
type CaptchaProviderId = (typeof CAPTCHA_PROVIDER_IDS)[number]

function isCaptchaProviderId(v: string): v is CaptchaProviderId {
  return (CAPTCHA_PROVIDER_IDS as readonly string[]).includes(v)
}

export default class CaptchaService {
  resolveProvider(row: IntegrationSetting): CaptchaProviderId | null {
    const p = row.captchaProvider?.trim()
    if (!p || !isCaptchaProviderId(p)) return null
    return p
  }

  resolveSiteKey(row: IntegrationSetting): string | null {
    const fromRow = row.captchaSiteKey?.trim()
    if (fromRow) return fromRow

    const provider = this.resolveProvider(row) ?? 'turnstile'
    if (provider === 'turnstile') {
      return env.get('TURNSTILE_SITE_KEY') || env.get('CAPTCHA_SITE_KEY') || null
    }
    if (provider === 'hcaptcha') {
      return env.get('HCAPTCHA_SITE_KEY') || null
    }
    return env.get('RECAPTCHA_SITE_KEY') || env.get('GOOGLE_RECAPTCHA_SITE_KEY') || null
  }

  async resolveSecretKey(row: IntegrationSetting): Promise<string | null> {
    if (row.captchaSecretEnc) {
      return decryptSecret(row.captchaSecretEnc)
    }
    const provider = this.resolveProvider(row) ?? 'turnstile'
    if (provider === 'turnstile') {
      return env.get('TURNSTILE_SECRET_KEY') || env.get('CAPTCHA_SECRET_KEY') || null
    }
    if (provider === 'hcaptcha') {
      return env.get('HCAPTCHA_SECRET_KEY') || null
    }
    return env.get('RECAPTCHA_SECRET_KEY') || env.get('GOOGLE_RECAPTCHA_SECRET_KEY') || null
  }

  isCaptchaEffective(row: IntegrationSetting): boolean {
    if (!row.captchaEnabled) return false
    if (!this.resolveProvider(row)) return false
    return Boolean(this.resolveSiteKey(row))
  }

  async verifyToken(
    row: IntegrationSetting,
    token: string | undefined,
    remoteIp?: string
  ): Promise<boolean> {
    const provider = this.resolveProvider(row)
    if (!provider) return false
    const secret = await this.resolveSecretKey(row)
    if (!token?.trim() || !secret?.trim()) return false

    if (provider === 'turnstile') {
      return this.postVerify('https://challenges.cloudflare.com/turnstile/v0/siteverify', secret, token, remoteIp)
    }
    if (provider === 'hcaptcha') {
      return this.postVerify('https://hcaptcha.com/siteverify', secret, token, remoteIp)
    }
    return this.postVerify('https://www.google.com/recaptcha/api/siteverify', secret, token, remoteIp)
  }

  private async postVerify(
    url: string,
    secret: string,
    token: string,
    remoteIp?: string
  ): Promise<boolean> {
    try {
      const body = new URLSearchParams()
      body.set('secret', secret)
      body.set('response', token)
      if (remoteIp) body.set('remoteip', remoteIp)
      const res = await fetch(url, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      })
      const data = (await res.json()) as { success?: boolean }
      return data.success === true
    } catch {
      return false
    }
  }
}
