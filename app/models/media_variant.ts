import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** A responsive derivative of a Media image. See the migration for rationale. */
export default class MediaVariant extends BaseModel {
  static table = 'media_variants'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare mediaId: string

  @column()
  declare width: number

  @column()
  declare height: number | null

  @column()
  declare format: string

  @column()
  declare url: string

  @column()
  declare bytes: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
