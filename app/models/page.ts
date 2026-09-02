import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/** Store/read a JSON(B) column as a plain object regardless of driver behaviour. */
const jsonColumn = {
  prepare: (v: unknown) => JSON.stringify(v ?? {}),
  consume: (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : (v ?? {})),
}

/**
 * Like `jsonColumn` but keeps `null` as `null` — for the staged draft columns
 * where "no draft" must be distinguishable from "an empty document".
 */
const nullableJsonColumn = {
  prepare: (v: unknown) => (v == null ? null : JSON.stringify(v)),
  consume: (v: unknown) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v),
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

  /**
   * Builder document or hand-written React.
   *
   * A CODE page ignores `content` entirely — its markup comes from the custom
   * component named by `component`.
   */
  @column()
  declare kind: 'BUILDER' | 'CODE'

  /**
   * Custom page slug for a CODE page, resolved against `inertia/custom/pages/`.
   *
   * Deliberately **not** an Inertia component name: the renderer looks this up
   * in a glob scoped to that one folder, so a page row cannot address an admin
   * screen or any other page in the app.
   */
  @column()
  declare component: string | null

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

  /**
   * Render no header / no footer at all.
   *
   * Separate from the ids above because null there means "use the site
   * default" — there was no way to say "none", which a sign-in or landing page
   * that owns the whole viewport needs.
   */
  @column()
  declare hideHeader: boolean

  @column()
  declare hideFooter: boolean

  @column()
  declare authorId: number | null

  // Staged, unpublished edits (autosave writes here; Publish promotes them).
  @column(nullableJsonColumn)
  declare draftContent: Record<string, unknown> | null

  @column(nullableJsonColumn)
  declare draftSeo: Record<string, unknown> | null

  @column.dateTime()
  declare draftUpdatedAt: DateTime | null

  // Scheduled status transitions, applied by `pages:run-schedule`.
  @column.dateTime()
  declare scheduledPublishAt: DateTime | null

  @column.dateTime()
  declare scheduledUnpublishAt: DateTime | null

  /** Shareable no-login preview token. */
  @column({ serializeAs: null })
  declare previewToken: string | null

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
