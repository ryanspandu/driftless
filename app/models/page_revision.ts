import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

const jsonColumn = {
  prepare: (v: unknown) => JSON.stringify(v ?? {}),
  consume: (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : (v ?? {})),
}

export default class PageRevision extends BaseModel {
  static table = 'page_revisions'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare pageId: string

  @column(jsonColumn)
  declare content: Record<string, unknown>

  @column(jsonColumn)
  declare seo: Record<string, unknown>

  @column()
  declare status: 'DRAFT' | 'PUBLISHED'

  @column()
  declare authorId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
