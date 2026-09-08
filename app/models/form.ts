import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { FormFieldDef } from '#services/form_schema'

/**
 * A named form definition. Submissions still land in `form_submissions`; this
 * adds a field schema for validation + a per-form view. See the migration.
 */
export default class Form extends BaseModel {
  static table = 'forms'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Stable key sent as the submit payload's `form`; never renamed. */
  @column()
  declare slug: string

  @column()
  declare title: string

  @column({
    prepare: (v: unknown) => JSON.stringify(v ?? []),
    consume: (v: unknown) =>
      v == null ? [] : typeof v === 'string' ? JSON.parse(v) : (v as FormFieldDef[]),
  })
  declare fields: FormFieldDef[]

  @column()
  declare successMessage: string | null

  @column()
  declare status: 'active' | 'inactive' | 'draft'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
