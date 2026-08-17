import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * "This page has no header / no footer", as its own fact.
 *
 * `header_template_id` could not express it. Null there already means "use the
 * site default", and the column carries a real foreign key to `templates`, so a
 * sentinel value like `'NONE'` would be rejected by the constraint rather than
 * stored. Two booleans say the thing directly.
 *
 * Default false, so every existing page keeps the header and footer it renders
 * today.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pages', (table) => {
      table.boolean('hide_header').notNullable().defaultTo(false)
      table.boolean('hide_footer').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('pages', (table) => {
      table.dropColumn('hide_header')
      table.dropColumn('hide_footer')
    })
  }
}
