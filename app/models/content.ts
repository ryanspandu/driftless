import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import ContentCategory from '#models/content_category'
import ContentTag from '#models/content_tag'

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

  // Who may read the post. A native column, gated server-side (the body is
  // withheld from the payload for PROTECTED/MEMBER until access is granted).
  @column()
  declare visibility: 'PUBLIC' | 'PROTECTED' | 'MEMBER'

  // The Protected password as an AES-256-GCM envelope. `serializeAs: null` so the
  // ciphertext never leaks through Lucid's default `.serialize()` — the service
  // builds DTOs by hand and never maps it out.
  @column({ serializeAs: null })
  declare passwordEnc: string | null

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

  @manyToMany(() => ContentCategory, {
    pivotTable: 'content_post_category',
    localKey: 'id',
    pivotForeignKey: 'content_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'category_id',
  })
  declare categories: ManyToMany<typeof ContentCategory>

  @manyToMany(() => ContentTag, {
    pivotTable: 'content_post_tag',
    localKey: 'id',
    pivotForeignKey: 'content_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'tag_id',
  })
  declare tags: ManyToMany<typeof ContentTag>
}
