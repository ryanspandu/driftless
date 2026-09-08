import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** A file attached to a form submission. See the migration for the design rationale. */
export default class FormUpload extends BaseModel {
  static table = 'form_uploads'
  static selfAssignPrimaryKey = true

  /** The opaque upload token (also the submission field's stored value). */
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare formId: string | null

  /** Null until the upload is bound to a submission; unbound rows are GC'd. */
  @column()
  declare submissionId: string | null

  @column()
  declare filename: string

  @column()
  declare storedName: string

  @column()
  declare mime: string

  @column()
  declare size: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
