import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What was actually sent, and what happened to it.
 *
 * Until now "did that receipt go out?" was unanswerable after the fact: both
 * transactional senders swallow their errors on purpose (a paid order stays
 * paid whether or not the email worked), so a dead SMTP relay produced a
 * console line in a process nobody was watching and nothing else.
 *
 * Deliberately not a full copy of the message. The body can contain a live
 * password-reset token and an order's contents; keeping it would turn this
 * table into a secret store and a GDPR liability. Recipient, subject and
 * outcome answer the operational question without holding either.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('mail_deliveries', (table) => {
      table.string('id').primary()

      /** Declared event this belongs to, or null for an unattributed send. */
      table.string('event_key', 96).nullable()

      table.string('to_address', 320).notNullable()
      table.string('subject', 512).nullable()

      // queued → the queue accepted it; sent → the relay accepted it;
      // failed → it did not go. `queued` is not success, and the difference is
      // the whole reason a worker being down is visible here.
      table.string('status', 16).notNullable()
      table.text('error').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('completed_at').nullable()

      table.index(['created_at'], 'mail_deliveries_created_index')
      table.index(['event_key', 'created_at'], 'mail_deliveries_event_index')
      table.index(['status', 'created_at'], 'mail_deliveries_status_index')
    })
  }

  async down() {
    this.schema.dropTable('mail_deliveries')
  }
}
