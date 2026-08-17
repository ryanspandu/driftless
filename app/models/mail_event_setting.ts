import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn } from '#models/_columns'

/**
 * An operator's overrides for one declared mail event.
 *
 * A missing row means "all defaults" — see the migration for why that is the
 * representation rather than seeding a row per event.
 */
export default class MailEventSetting extends BaseModel {
  static table = 'mail_event_settings'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare key: string

  @column(booleanColumn)
  declare enabled: boolean

  /**
   * Copy overrides. `null` means "use the template's own text" — distinct from
   * `''`, which means the operator deliberately emptied that part.
   */
  @column()
  declare subject: string | null

  @column()
  declare heading: string | null

  @column()
  declare intro: string | null

  @column()
  declare buttonLabel: string | null

  @column()
  declare outro: string | null

  /**
   * A designed EMAIL template to use instead of the built-in layout.
   *
   * Null — the common case — renders through `emails/event.edge`.
   */
  @column()
  declare templateId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
