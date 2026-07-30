import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import GatewayCredential from '#modules/ecommerce/models/gateway_credential'
import type { GatewayMode, GatewayName } from '#modules/ecommerce/models/gateway_credential'

/**
 * Purpose tags bound into each ciphertext.
 *
 * A value encrypted for one purpose cannot be decrypted under another, so a
 * ciphertext cannot be lifted out of `webhook_secret_enc` and replayed into
 * `secret_key_enc` — where it would be handed to the gateway as an API key.
 */
const PURPOSE = {
  secretKey: 'ecommerce_gateway_secret_key',
  webhookSecret: 'ecommerce_gateway_webhook_secret',
} as const

/** What the admin API returns. Never contains a secret in the clear. */
export interface GatewayCredentialDto {
  gateway: GatewayName
  mode: GatewayMode
  enabled: boolean
  publicKey: string | null
  secretKeyMasked: string | null
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  connectedAt: string | null
  lastVerifiedAt: string | null
  lastVerifyError: string | null
}

/** The decrypted credentials. Never leaves the server. */
export interface ResolvedGatewayCredentials {
  gateway: GatewayName
  mode: GatewayMode
  publicKey: string | null
  secretKey: string
  webhookSecret: string | null
}

export interface UpdateGatewayCredentialsDto {
  enabled?: boolean
  publicKey?: string | null
  /** Omit to keep the stored key; empty string clears it. */
  secretKey?: string | null
  webhookSecret?: string | null
}

function maskSecret(value: string | null): string | null {
  if (!value) return null
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(8, value.length - 8))}${value.slice(-4)}`
}

export default class GatewayCredentialsService {
  async getOrCreate(gateway: GatewayName, mode: GatewayMode): Promise<GatewayCredential> {
    const existing = await GatewayCredential.query()
      .where('gateway', gateway)
      .where('mode', mode)
      .first()
    if (existing) return existing

    return GatewayCredential.create({
      id: newUlid(),
      gateway,
      mode,
      enabled: false,
    })
  }

  async list(): Promise<GatewayCredentialDto[]> {
    const rows = await GatewayCredential.query().orderBy('gateway').orderBy('mode')
    return rows.map((row) => this.toDto(row))
  }

  async update(
    gateway: GatewayName,
    mode: GatewayMode,
    dto: UpdateGatewayCredentialsDto
  ): Promise<GatewayCredentialDto> {
    const row = await this.getOrCreate(gateway, mode)

    if (dto.publicKey !== undefined) row.publicKey = dto.publicKey || null

    /**
     * `undefined` keeps the stored secret, `''` clears it. The admin UI only
     * sends these fields when someone types a new value — otherwise toggling
     * "enabled" would silently wipe the API key.
     */
    if (dto.secretKey !== undefined) {
      row.secretKeyEnc = dto.secretKey
        ? encryption.encrypt(dto.secretKey, undefined, PURPOSE.secretKey)
        : null
    }
    if (dto.webhookSecret !== undefined) {
      row.webhookSecretEnc = dto.webhookSecret
        ? encryption.encrypt(dto.webhookSecret, undefined, PURPOSE.webhookSecret)
        : null
    }

    if (dto.enabled !== undefined) {
      if (dto.enabled && !row.secretKeyEnc) {
        throw publicError.unprocessable(
          'Add a secret key before enabling this gateway.',
          'secret_key_required'
        )
      }
      row.enabled = dto.enabled
      if (dto.enabled && !row.connectedAt) row.connectedAt = DateTime.now()
    }

    await row.save()
    return this.toDto(row)
  }

  /**
   * The credentials a payment should actually use.
   *
   * Throws rather than returning null: a checkout that reaches this point and
   * finds no usable credentials must fail loudly, not fall through to some
   * other gateway or silently produce an unpayable order.
   */
  async resolve(gateway: GatewayName): Promise<ResolvedGatewayCredentials> {
    const row = await GatewayCredential.query()
      .where('gateway', gateway)
      .where('enabled', true)
      .first()

    if (!row || !row.secretKeyEnc) {
      throw publicError.unavailable(
        `${gateway} is not connected. Add its API keys in E-commerce → Settings.`,
        'gateway_not_configured'
      )
    }

    const secretKey = encryption.decrypt<string>(row.secretKeyEnc, PURPOSE.secretKey)

    /**
     * A null here means the ciphertext could not be read, which in practice
     * means `APP_KEY` was rotated without `APP_KEY_PREVIOUS` being set.
     *
     * 503 with a clear message rather than a silent fallback or a decryption
     * stack trace: taking payments with the wrong key is not an option, and
     * neither is telling the buyer "something went wrong" while an operator
     * has no idea what.
     */
    if (secretKey === null) {
      throw publicError.unavailable(
        `Stored ${gateway} credentials cannot be decrypted. If APP_KEY was rotated, set APP_KEY_PREVIOUS and re-save the keys.`,
        'gateway_credentials_unreadable'
      )
    }

    return {
      gateway: row.gateway,
      mode: row.mode,
      publicKey: row.publicKey,
      secretKey,
      webhookSecret: row.webhookSecretEnc
        ? encryption.decrypt<string>(row.webhookSecretEnc, PURPOSE.webhookSecret)
        : null,
    }
  }

  /** Which gateways a buyer can actually pay with right now. */
  async enabledGateways(): Promise<GatewayName[]> {
    const rows = await GatewayCredential.query()
      .where('enabled', true)
      .whereNotNull('secret_key_enc')
    return [...new Set(rows.map((r) => r.gateway))]
  }

  async recordVerification(
    gateway: GatewayName,
    mode: GatewayMode,
    ok: boolean,
    error?: string
  ): Promise<void> {
    const row = await this.getOrCreate(gateway, mode)
    row.lastVerifiedAt = DateTime.now()
    row.lastVerifyError = ok ? null : (error ?? 'Unknown error').slice(0, 512)
    await row.save()
  }

  private toDto(row: GatewayCredential): GatewayCredentialDto {
    const secretKey = row.secretKeyEnc
      ? encryption.decrypt<string>(row.secretKeyEnc, PURPOSE.secretKey)
      : null

    return {
      gateway: row.gateway,
      mode: row.mode,
      enabled: row.enabled,
      publicKey: row.publicKey,
      secretKeyMasked: maskSecret(secretKey),
      hasSecretKey: Boolean(row.secretKeyEnc),
      hasWebhookSecret: Boolean(row.webhookSecretEnc),
      connectedAt: row.connectedAt?.toISO() ?? null,
      lastVerifiedAt: row.lastVerifiedAt?.toISO() ?? null,
      lastVerifyError: row.lastVerifyError,
    }
  }
}
