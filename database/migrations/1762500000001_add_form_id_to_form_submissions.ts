import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Link a submission to its form definition.
 *
 * Nullable on purpose: legacy free-text `FormBlock`s (and any form with no
 * definition) keep working with `form_id` NULL, matched only by `form_name` as
 * before. A defined form's submissions carry the id so the per-form view and a
 * later title rename stay correct.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('form_submissions', (table) => {
      table.string('form_id', 26).nullable()
      table.index(['form_id', 'created_at'], 'form_submissions_form_id_index')
    })
  }

  async down() {
    this.schema.alterTable('form_submissions', (table) => {
      table.dropIndex(['form_id', 'created_at'], 'form_submissions_form_id_index')
      table.dropColumn('form_id')
    })
  }
}
