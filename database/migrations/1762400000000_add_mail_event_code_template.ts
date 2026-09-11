import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A code EMAIL template a mail event can be wired to, alongside the DB one.
 *
 * `template_id` is a real FK to `templates.id`, so a `codetpl:<kit>/email/<name>`
 * pointer (a kit's `emails/<name>.tsx`, flattened to HTML at build time) cannot
 * live there — it has no row. So it gets its own nullable string column, exactly
 * as page code-chrome kept `code_header`/`code_footer`/`code_layout` separate
 * from the FK template columns. The two are mutually exclusive per event: the
 * wiring picker sets one and clears the other.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('mail_event_settings', (table) => {
      table.string('code_template').nullable()
    })
  }

  async down() {
    this.schema.alterTable('mail_event_settings', (table) => {
      table.dropColumn('code_template')
    })
  }
}
