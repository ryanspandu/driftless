import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * A storefront session.
 *
 * Only the hash of the token is stored, exactly as `auth_access_tokens` does:
 * a database leak must not hand over live sessions. The plaintext lives in a
 * signed, httpOnly cookie named `dl_shop`, which shares nothing with the admin
 * session cookie.
 */
export default class CustomerSession extends BaseModel {
  static table = 'ecommerce_customer_sessions'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare customerId: string

  @column({ serializeAs: null })
  declare tokenHash: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare revokedAt: DateTime | null

  @column.dateTime()
  declare lastUsedAt: DateTime | null

  @column()
  declare ipHash: string | null

  @column()
  declare userAgent: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  /**
   * Truthiness rather than `=== null`: a freshly created instance has
   * `revokedAt` as `undefined` (Lucid does not read a nullable column back
   * unless it was passed), and `undefined === null` is false — which would make
   * a brand-new session report itself as dead.
   */
  get isLive(): boolean {
    return !this.revokedAt && this.expiresAt > DateTime.now()
  }
}
