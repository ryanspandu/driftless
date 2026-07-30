import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn } from '#models/_columns'

export type GatewayName = 'stripe' | 'paypal'
export type GatewayMode = 'test' | 'live'

/**
 * API credentials for one gateway in one mode.
 *
 * Test and live keys are separate rows so a test key can never settle a live
 * payment, and vice versa.
 */
export default class GatewayCredential extends BaseModel {
  static table = 'ecommerce_gateway_credentials'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare gateway: GatewayName

  @column()
  declare mode: GatewayMode

  /** Publishable key / client id. Public by design — stored in the clear. */
  @column()
  declare publicKey: string | null

  /**
   * AES-256-GCM ciphertext. `serializeAs: null` is a second line of defence:
   * even if a raw model reached a response, this column would not.
   */
  @column({ serializeAs: null })
  declare secretKeyEnc: string | null

  @column({ serializeAs: null })
  declare webhookSecretEnc: string | null

  @column(booleanColumn)
  declare enabled: boolean

  @column.dateTime()
  declare connectedAt: DateTime | null

  @column.dateTime()
  declare lastVerifiedAt: DateTime | null

  @column()
  declare lastVerifyError: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
