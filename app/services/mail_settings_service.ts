import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import env from '#start/env'
import MailSetting from '#models/mail_setting'

/**
 * Purpose tag bound into the ciphertext, so an SMTP password cannot be lifted
 * out of this column and decrypted as, say, a payment gateway secret.
 */
const SECRET_PURPOSE = 'mail_settings'

const ROW_ID = 'default'

/** What the admin API returns. Never contains the password in the clear. */
export interface MailSettingsDto {
  enabled: boolean
  host: string | null
  port: number | null
  secure: boolean
  username: string | null
  /** Masked, e.g. `abcd••••••••wxyz`. Null when unset. */
  passwordMasked: string | null
  hasPasswordInDb: boolean
  fromAddress: string | null
  fromName: string | null
  lastTestedAt: string | null
  lastTestOk: boolean | null
  lastTestError: string | null
  /** True when env vars would provide a working transport without DB config. */
  envFallbackConfigured: boolean
}

/** The transport settings actually used to send. Never leaves the server. */
export interface ResolvedSmtpConfig {
  source: 'database' | 'env'
  host: string
  port: number
  secure: boolean
  username: string | null
  password: string | null
  fromAddress: string
  fromName: string
}

export interface UpdateMailSettingsDto {
  enabled?: boolean
  host?: string | null
  port?: number | null
  secure?: boolean
  username?: string | null
  /** Omit to keep the stored password; empty string clears it. */
  password?: string | null
  fromAddress?: string | null
  fromName?: string | null
}

function maskSecret(value: string | null): string | null {
  if (!value) return null
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(8, value.length - 8))}${value.slice(-4)}`
}

export default class MailSettingsService {
  async getOrCreate(): Promise<MailSetting> {
    const existing = await MailSetting.find(ROW_ID)
    if (existing) return existing
    return MailSetting.create({ id: ROW_ID, enabled: false, secure: false })
  }

  /** True when env alone could send mail, used to explain the fallback in the UI. */
  private envConfigured(): boolean {
    return Boolean(env.get('SMTP_HOST'))
  }

  async getDto(): Promise<MailSettingsDto> {
    const row = await this.getOrCreate()
    const password = row.passwordEnc ? this.decrypt(row.passwordEnc) : null

    return {
      enabled: row.enabled,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      passwordMasked: maskSecret(password),
      hasPasswordInDb: Boolean(row.passwordEnc),
      fromAddress: row.fromAddress,
      fromName: row.fromName,
      lastTestedAt: row.lastTestedAt?.toISO() ?? null,
      lastTestOk: row.lastTestOk,
      lastTestError: row.lastTestError,
      envFallbackConfigured: this.envConfigured(),
    }
  }

  async update(dto: UpdateMailSettingsDto): Promise<MailSettingsDto> {
    const row = await this.getOrCreate()

    if (dto.enabled !== undefined) row.enabled = dto.enabled
    if (dto.host !== undefined) row.host = dto.host || null
    if (dto.port !== undefined) row.port = dto.port ?? null
    if (dto.secure !== undefined) row.secure = dto.secure
    if (dto.username !== undefined) row.username = dto.username || null
    if (dto.fromAddress !== undefined) row.fromAddress = dto.fromAddress || null
    if (dto.fromName !== undefined) row.fromName = dto.fromName || null

    /**
     * `undefined` keeps the stored password, `''` clears it. The admin UI shows
     * a masked value and only sends this field when someone actually types a
     * new one — otherwise editing the host would silently wipe the password.
     */
    if (dto.password !== undefined) {
      row.passwordEnc = dto.password ? this.encrypt(dto.password) : null
    }

    await row.save()
    return this.getDto()
  }

  /**
   * The settings a send should actually use.
   *
   * Database first (an operator configured it from the dashboard), env second.
   * Returns `null` when neither is usable, which callers treat as "email is not
   * configured" rather than as an error.
   */
  async resolve(): Promise<ResolvedSmtpConfig | null> {
    const row = await this.getOrCreate()

    if (row.enabled && row.host) {
      return {
        source: 'database',
        host: row.host,
        port: row.port ?? 587,
        secure: row.secure,
        username: row.username,
        password: row.passwordEnc ? this.decrypt(row.passwordEnc) : null,
        fromAddress: row.fromAddress || env.get('MAIL_FROM_ADDRESS', 'no-reply@driftless.local'),
        fromName: row.fromName || env.get('MAIL_FROM_NAME', 'Driftless'),
      }
    }

    const envHost = env.get('SMTP_HOST')
    if (!envHost) return null

    return {
      source: 'env',
      host: envHost,
      port: Number(env.get('SMTP_PORT', 587)),
      secure: env.get('SMTP_SECURE', 'false') === 'true',
      username: env.get('SMTP_USERNAME') || null,
      password: env.get('SMTP_PASSWORD') || null,
      fromAddress: env.get('MAIL_FROM_ADDRESS', 'no-reply@driftless.local'),
      fromName: env.get('MAIL_FROM_NAME', 'Driftless'),
    }
  }

  /** Record the outcome of a test send so the admin screen can show it. */
  async recordTest(ok: boolean, error?: string | null): Promise<void> {
    const row = await this.getOrCreate()
    row.lastTestedAt = DateTime.now()
    row.lastTestOk = ok
    row.lastTestError = ok ? null : (error ?? 'Unknown error').slice(0, 512)
    await row.save()
  }

  private encrypt(plain: string): string {
    return encryption.encrypt(plain, undefined, SECRET_PURPOSE)
  }

  /**
   * Returns `null` rather than throwing when the ciphertext cannot be read —
   * which in practice means `APP_KEY` was rotated without setting
   * `APP_KEY_PREVIOUS`. The caller then behaves as if no password is set, and
   * the send fails with an authentication error that points at the real cause,
   * instead of a decryption stack trace.
   */
  private decrypt(enc: string): string | null {
    return encryption.decrypt<string>(enc, SECRET_PURPOSE)
  }
}
