import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-email operator settings, keyed by the event key it customises.
 *
 * A row is written only when something is actually changed, so an empty table
 * means "everything at its declared default". That is what lets a module change
 * a default in code and have it take effect, instead of being shadowed forever
 * by a row written at install time.
 *
 * `key` is the primary key rather than a ULID: there is exactly one settings
 * row per event by definition, and making that a database fact removes the
 * "which of these two rows wins" question entirely.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('mail_event_settings', (table) => {
      table.string('key', 96).primary()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable('mail_event_settings')
  }
}
