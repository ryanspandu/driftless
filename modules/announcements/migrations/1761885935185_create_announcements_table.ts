import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Idempotent on purpose — this migration moved.
 *
 * It used to live at `plugins/announcements/migrations/…`, and Lucid records a
 * migration by its **path**. Moving the folder therefore makes the same file
 * look brand new: every database that already ran it sees
 * `modules/announcements/migrations/…` as pending and runs it a second time,
 * failing on `CREATE TABLE announcements` against a table that already exists.
 *
 * Renaming the recorded row instead would be tidier, but it cannot work on its
 * own: the migrator computes its pending list *before* running anything, so a
 * rename performed by a later migration comes too late to change the decision.
 * This guard is what actually makes the move survivable;
 * `…_unify_plugins_into_modules` then clears the stale `plugins/%` row.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      if (await db.schema.hasTable('announcements')) return

      await db.schema.createTable('announcements', (table) => {
        table.string('id').primary()
        table.string('title').notNullable()
        table.text('body').notNullable().defaultTo('')
        table.boolean('published').notNullable().defaultTo(false)
        table
          .integer('created_by_user_id')
          .nullable()
          .references('id')
          .inTable('users')
          .onDelete('SET NULL')
        table.timestamps(true, true)
        table.timestamp('deleted_at').nullable()
      })
    })
  }

  async down() {
    this.schema.dropTableIfExists('announcements')
  }
}
