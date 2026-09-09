import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/**
 * A content category — a first-class taxonomy for the built-in Content posts
 * (separate from the generic CMS collections). Has a slug (public archive at
 * `/category/:slug`), an optional parent for hierarchy, and is assigned to posts
 * through the `content_category` pivot.
 */
export default class ContentCategory extends BaseModel {
  static table = 'content_categories'
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
  declare parentId: string | null

  @column()
  declare position: number

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => ContentCategory, { foreignKey: 'parentId' })
  declare parent: BelongsTo<typeof ContentCategory>

  @hasMany(() => ContentCategory, { foreignKey: 'parentId' })
  declare children: HasMany<typeof ContentCategory>
}
