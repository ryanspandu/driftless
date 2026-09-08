import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Named form definitions.
 *
 * A form is a stable `slug` plus a JSON `fields` schema. Submissions still land
 * in `form_submissions` (the schema-less inbox); a definition adds validation +
 * whitelisting on the way in, and a per-form view on the way out. Fields live as
 * JSON — a form backs no SQL columns of its own — so this stays far simpler than
 * a CMS collection.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('forms', (table) => {
      table.string('id').primary()
      // Stable key sent as the submit payload's `form`; how a submission is
      // matched to its definition. Never renamed (the title is the display name).
      table.string('slug', 120).notNullable().unique()
      table.string('title', 200).notNullable()
      table.jsonb('fields').notNullable().defaultTo('[]')
      table.string('success_message', 500).nullable()
      // active → accepts submissions; inactive/draft → definition kept, intake off.
      table.string('status', 16).notNullable().defaultTo('active')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['status'], 'forms_status_index')
    })
  }

  async down() {
    this.schema.dropTable('forms')
  }
}
