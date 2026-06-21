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
      const globals = await db.rawQuery("SELECT to_regclass('public.page_globals') AS t")
      if (globals.rows?.[0]?.t) {
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

      const pageTemplates = await db.rawQuery("SELECT to_regclass('public.page_templates') AS t")
      if (pageTemplates.rows?.[0]?.t) {
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
