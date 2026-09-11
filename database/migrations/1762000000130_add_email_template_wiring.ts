import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Wires designed email templates to the events that send them.
 *
 * `templates.rendered_html` holds the design already flattened to email HTML.
 * Rendering happens once, when the operator publishes, rather than on every
 * send — the queue worker has no Vite/SSR bundle loaded, so rendering React
 * there would mean building and shipping a second one purely to format mail.
 * Sending then costs a string substitution.
 *
 * `mail_event_settings.template_id` is nullable and `SET NULL` on delete:
 * losing the template must fall back to the built-in design, never stop the
 * email.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('templates', (table) => {
      table.text('rendered_html').nullable()
    })

    this.schema.alterTable('mail_event_settings', (table) => {
      table
        .string('template_id')
        .nullable()
        .references('id')
        .inTable('templates')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable('mail_event_settings', (table) => {
      table.dropColumn('template_id')
    })
    this.schema.alterTable('templates', (table) => {
      table.dropColumn('rendered_html')
    })
  }
}
