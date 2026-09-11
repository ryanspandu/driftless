import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One URL redirect. See the migration for the design rationale. */
export default class Redirect extends BaseModel {
  static table = 'redirects'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare fromPath: string

  @column()
  declare toPath: string

  @column()
  declare status: number

  @column()
  declare hits: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
