import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn, nullableBooleanColumn } from '#models/_columns'

/** Single-row SMTP configuration. Always id `default`. */
export default class MailSetting extends BaseModel {
  static table = 'mail_settings'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column(booleanColumn)
  declare enabled: boolean

  @column()
  declare host: string | null

  @column()
  declare port: number | null

  @column(booleanColumn)
  declare secure: boolean

  @column()
  declare username: string | null

  /** Ciphertext. Never serialise this — the DTO exposes a masked form instead. */
  @column({ serializeAs: null })
  declare passwordEnc: string | null

  @column()
  declare fromAddress: string | null

  @column()
  declare fromName: string | null

  @column.dateTime()
  declare lastTestedAt: DateTime | null

  @column(nullableBooleanColumn)
  declare lastTestOk: boolean | null

  @column()
  declare lastTestError: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
