import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Files attached to form submissions.
 *
 * Isolated from the operator media library on purpose: these are ANONYMOUS
 * uploads, so they get their own store, an opaque token id (never a guessable
 * URL), and admin-only serving. A row is created on upload and bound to a
 * submission when the form is submitted; unbound rows are garbage-collected.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('form_uploads', (table) => {
      table.string('id').primary() // the opaque token
      table.string('form_id', 26).nullable()
      table.string('submission_id', 26).nullable()
      table.string('filename', 255).notNullable() // original name (metadata only)
      table.string('stored_name', 255).notNullable() // random name on disk
      table.string('mime', 128).notNullable()
      table.integer('size').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()

      table.index(['submission_id'], 'form_uploads_submission_index')
      table.index(['created_at'], 'form_uploads_created_index')
    })
  }

  async down() {
    this.schema.dropTable('form_uploads')
  }
}
