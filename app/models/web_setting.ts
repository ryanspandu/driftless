import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class WebSetting extends BaseModel {
  static table = 'web_settings'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare section: string

  @column()
  declare key: string

  @column()
  declare value: string

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
