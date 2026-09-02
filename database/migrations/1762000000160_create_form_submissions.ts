import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Submissions from builder `FormBlock`s set to "Collect".
 *
 * The builder could always render a form; until now a generic (non-auth) form
 * had nowhere to post. This is that store — one row per submission, viewable in
 * the admin inbox, with the raw field values kept as JSON so any form shape is
 * captured without a schema per form.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('form_submissions', (table) => {
      table.string('id').primary()
      table.string('form_name', 200).notNullable().defaultTo('Form')
      table.string('page_path', 512).nullable()
      table.jsonb('data').notNullable().defaultTo('{}')
      // Pulled out of the payload when a field named `email` is present, so the
      // inbox can show a sender without digging into the JSON.
      table.string('email', 254).nullable()
      table.string('ip_hash', 64).nullable()
      table.string('user_agent', 512).nullable()
      // new → read → spam. Honeypot hits land straight in `spam`.
      table.string('status', 16).notNullable().defaultTo('new')
      table.timestamp('created_at').notNullable()

      table.index(['created_at'], 'form_submissions_created_index')
      table.index(['status', 'created_at'], 'form_submissions_status_index')
      table.index(['form_name'], 'form_submissions_form_index')
    })
  }

  async down() {
    this.schema.dropTable('form_submissions')
  }
}
