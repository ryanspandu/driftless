import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/**
 * One "forgot password" link.
 *
 * The plaintext token never reaches this table — only its SHA-256, which is
 * what every lookup matches against. See `PasswordResetService`.
 */
export default class PasswordResetToken extends BaseModel {
  static table = 'password_reset_tokens'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: number

  @column()
  declare tokenHash: string

  @column.dateTime()
  declare expiresAt: DateTime

  /** Set the moment the token is spent. A token with this set is dead. */
  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
