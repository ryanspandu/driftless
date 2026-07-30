import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('templates', (table) => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.string('type', 20).notNullable() // HEADER | FOOTER | COMPONENT | LAYOUT
      table.jsonb('content').notNullable().defaultTo('{}')
      table.boolean('is_default').notNullable().defaultTo(false)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
      table.index(['type'])
    })

    this.schema.alterTable('pages', (table) => {
      table
        .string('layout_id')
        .nullable()
        .references('id')
        .inTable('templates')
        .onDelete('SET NULL')
      table
        .string('header_template_id')
        .nullable()
        .references('id')
        .inTable('templates')
        .onDelete('SET NULL')
      table
        .string('footer_template_id')
        .nullable()
        .references('id')
        .inTable('templates')
        .onDelete('SET NULL')
    })

    // Non-destructive data migration: copy existing globals + page templates in.
    // (page_globals / page_templates tables are left in place and removed later.)
    this.defer(async (db) => {
      /**
       * This backfill only applies to installs that predate the templates
       * table, which are all PostgreSQL. The statements below are pg-specific
       * (`gen_random_uuid()`, `now()`), and the existence probe used to be
       * `to_regclass()` — also pg-only, which made every migration run under
       * SQLite throw. The test suite runs on SQLite, so that took the whole
       * functional suite down with it.
       *
       * A fresh database has no legacy tables to copy, so skipping is correct
       * rather than merely convenient.
       */
      if (db.dialect.name !== 'postgres') return

      if (await db.schema.hasTable('page_globals')) {
        await db.rawQuery(
          `INSERT INTO templates (id, name, type, content, is_default, created_at, updated_at)
           SELECT gen_random_uuid()::text, 'Site Header', 'HEADER', content, true, now(), now()
           FROM page_globals WHERE key = 'header'`
        )
        await db.rawQuery(
          `INSERT INTO templates (id, name, type, content, is_default, created_at, updated_at)
           SELECT gen_random_uuid()::text, 'Site Footer', 'FOOTER', content, true, now(), now()
           FROM page_globals WHERE key = 'footer'`
        )
      }

      if (await db.schema.hasTable('page_templates')) {
        await db.rawQuery(
          `INSERT INTO templates (id, name, type, content, is_default, created_at, updated_at)
           SELECT id, name, 'COMPONENT', content, false, created_at, updated_at
           FROM page_templates WHERE deleted_at IS NULL`
        )
      }
    })
  }

  async down() {
    this.schema.alterTable('pages', (table) => {
      table.dropColumn('layout_id')
      table.dropColumn('header_template_id')
      table.dropColumn('footer_template_id')
    })
    this.schema.dropTable('templates')
  }
}
