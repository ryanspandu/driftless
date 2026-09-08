import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class Content extends BaseModel {
  static table = 'contents'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare title: string

  @column()
  declare slug: string

  @column()
  declare body: string

  @column()
  declare status: 'DRAFT' | 'PUBLISHED'

  // Native featured image / thumbnail: a media URL (`/uploads/…`).
  @column()
  declare featuredImage: string | null

  // Custom fields defined by the Content-type collection, keyed by field key.
  // Stored as one JSON blob; mirrors `CmsCollection.listConfig`'s round-trip.
  @column({
    prepare: (v) => (v === null || v === undefined ? null : JSON.stringify(v)),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? null)),
  })
  declare data: Record<string, unknown> | null

  @column()
  declare authorId: number | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Explicit: Lucid would otherwise derive `userId` from the model name, and
  // the column is `author_id`. Preloading threw until this was set.
  @belongsTo(() => User, { foreignKey: 'authorId' })
  declare author: BelongsTo<typeof User>
}
