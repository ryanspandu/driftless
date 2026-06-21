import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Plugin extends BaseModel {
  static table = 'plugins'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Unique plugin key (= folder name under `plugins/`). */
  @column()
  declare name: string

  @column()
  declare enabled: boolean

  @column()
  declare version: string | null

  @column.dateTime()
  declare installedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
