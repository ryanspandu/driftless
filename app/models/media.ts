import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Media extends BaseModel {
  static table = 'media'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare filename: string

  @column()
  declare mimeType: string

  @column()
  declare size: number

  @column()
  declare url: string

  @column()
  declare title: string | null

  @column()
  declare description: string | null

  @column()
  declare alt: string | null

  @column()
  declare width: number | null

  @column()
  declare height: number | null

  @column()
  declare authorId: number | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
