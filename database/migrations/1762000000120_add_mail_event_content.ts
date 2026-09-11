import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Operator-editable copy for one email.
 *
 * Every column is nullable, and null means "use whatever the template ships".
 * That is deliberate: an empty string is a legitimate value for an intro
 * paragraph ("say nothing here"), so blank-means-default would make that
 * impossible to express, and shipping a copy of the default text into the row
 * would freeze it against every future improvement.
 *
 * Only the parts that are safe to hand over are here. The reset link, the order
 * table, the tracking number and the expiry are computed by the service and are
 * not editable — a template that could drop the link is a template that can
 * break the flow it exists to serve.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('mail_event_settings', (table) => {
      table.string('subject', 512).nullable()
      table.string('heading', 255).nullable()
      table.text('intro').nullable()
      table.string('button_label', 128).nullable()
      table.text('outro').nullable()
    })
  }

  async down() {
    this.schema.alterTable('mail_event_settings', (table) => {
      table.dropColumn('subject')
      table.dropColumn('heading')
      table.dropColumn('intro')
      table.dropColumn('button_label')
      table.dropColumn('outro')
    })
  }
}
