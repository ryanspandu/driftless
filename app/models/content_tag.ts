import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * A content tag — a flat, first-class taxonomy for the built-in Content posts
 * (separate from Categories, which are hierarchical). Has a slug (public archive
 * at `/tag/:slug`) and is assigned to posts through the `content_post_tag` pivot.
 */
export default class ContentTag extends BaseModel {
  static table = 'content_tags'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare description: string | null

  @column()
  declare position: number

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
