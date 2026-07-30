import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/** Store/read a JSON(B) column as a plain object regardless of driver behaviour. */
const jsonColumn = {
  prepare: (v: unknown) => JSON.stringify(v ?? {}),
  consume: (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : (v ?? {})),
}

export default class Page extends BaseModel {
  static table = 'pages'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare title: string

  @column()
  declare path: string

  @column()
  declare status: 'DRAFT' | 'PUBLISHED'

  @column()
  declare renderMode: 'SSR' | 'SSG' | 'CSR'

  /** Puck block tree (`{ content, root, zones }`). */
  @column(jsonColumn)
  declare content: Record<string, unknown>

  /** Cached HTML for SSG pages (populated at publish in a later phase). */
  @column()
  declare renderedHtml: string | null

  /**
   * The build that produced `renderedHtml`.
   *
   * The snapshot has hashed asset URLs baked into it, so it is only servable
   * while those chunks are still on disk. Anything other than the running
   * build's id — including null, which every pre-existing snapshot has — means
   * re-render.
   */
  @column()
  declare renderedBuild: string | null

  @column(jsonColumn)
  declare seo: Record<string, unknown>

  /** Optional composition: a LAYOUT template wrapping this page, and per-page
   *  header/footer overrides (all reference `templates.id`). */
  @column()
  declare layoutId: string | null

  @column()
  declare headerTemplateId: string | null

  @column()
  declare footerTemplateId: string | null

  @column()
  declare authorId: number | null

  @column.dateTime()
  declare publishedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare author: BelongsTo<typeof User>
}
