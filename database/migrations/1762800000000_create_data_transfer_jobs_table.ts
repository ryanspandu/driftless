import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per site export/import run started from the admin UI.
 *
 * The row **is** the state machine (same idea as `module_install_jobs`): a
 * background worker — or the inline fallback when no worker/Redis is available —
 * writes progress here, and the admin page polls it. Kept separate from the
 * BullMQ queue's own bookkeeping so a lost Redis job never loses the operator's
 * visible status.
 */
export default class extends BaseSchema {
  protected tableName = 'data_transfer_jobs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary()

      /** import | export */
      table.string('kind').notNullable()
      /** queued | running | succeeded | failed */
      table.string('state').notNullable().defaultTo('queued')

      /**
       * Single-flight per kind, as a nullable column with a plain unique index —
       * the value is the kind ('import'/'export') while active, NULL once
       * terminal. NULLs are distinct in Postgres and SQLite, so one active import
       * and one active export can coexist while unlimited finished rows pile up.
       */
      table.string('active_lock').nullable()
      table.unique(['active_lock'], { indexName: 'data_transfer_jobs_active' })

      /** Section progress: how many of `total` sections have finished. */
      table.integer('total').notNullable().defaultTo(0)
      table.integer('completed').notNullable().defaultTo(0)
      table.string('current_section').nullable()

      /** Tail of the section log, shown live in the UI. */
      table.json('log_tail').nullable()
      table.text('error_message').nullable()
      /** The final ImportResult (import) or export meta, surfaced when succeeded. */
      table.json('result').nullable()

      /** Where the uploaded archive was staged (import) / the built archive (export). */
      table.string('archive_path').nullable()
      table.string('download_path').nullable()

      /** The chosen options, echoed back for the UI + re-run. */
      table.string('mode').nullable()
      table.string('conflict').nullable()
      table.json('only').nullable()
      table.boolean('dry_run').notNullable().defaultTo(false)

      table.integer('author_id').nullable()

      table.timestamp('started_at').nullable()
      table.timestamp('finished_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['state'])
      table.index(['kind'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
