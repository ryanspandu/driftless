import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-page code header / footer / layout — a page can point its chrome at a kit
 * component instead of a builder template.
 *
 * These are separate from `header_template_id` / `footer_template_id` /
 * `layout_id` on purpose: those carry a real foreign key to `templates`, so a
 * `codetpl:<kit>/<type>` pointer would be rejected by the constraint. Plain
 * nullable strings (no FK) hold the pointer; the renderer prefers a set code
 * column over the template id for that slot. Null everywhere = unchanged.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pages', (table) => {
      table.string('code_header').nullable()
      table.string('code_footer').nullable()
      table.string('code_layout').nullable()
    })
  }

  async down() {
    this.schema.alterTable('pages', (table) => {
      table.dropColumn('code_header')
      table.dropColumn('code_footer')
      table.dropColumn('code_layout')
    })
  }
}
