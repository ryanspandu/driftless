import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn } from '#models/_columns'

/**
 * Activation state for a custom-code template kit, keyed by its folder slug.
 *
 * The kit itself is a folder on disk (`inertia/custom/kits/<slug>/`); this row
 * exists only to hold the mutable `active` flag. Absence of a row — or
 * `active = false` — means inactive (fail-closed), so nothing a kit ships can
 * make it visible; only an admin toggle can.
 */
export default class TemplateKitState extends BaseModel {
  static table = 'template_kits'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare slug: string

  @column(booleanColumn)
  declare active: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
