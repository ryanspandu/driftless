import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One builder-form submission. See the migration for the design rationale. */
export default class FormSubmission extends BaseModel {
  static table = 'form_submissions'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare formName: string

  @column()
  declare pagePath: string | null

  @column({
    prepare: (v: unknown) => JSON.stringify(v ?? {}),
    consume: (v: unknown) =>
      v == null ? {} : typeof v === 'string' ? JSON.parse(v) : (v as Record<string, unknown>),
  })
  declare data: Record<string, unknown>

  @column()
  declare email: string | null

  @column({ serializeAs: null })
  declare ipHash: string | null

  @column()
  declare userAgent: string | null

  @column()
  declare status: 'new' | 'read' | 'spam'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
