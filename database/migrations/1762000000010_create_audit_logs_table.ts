import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Append-only record of consequential actions.
 *
 * The repo had no generic audit trail — only content versioning
 * (`page_revisions`, `cms_revisions`). Once money is involved, "who refunded
 * this, when, and from where" has to be answerable after the fact, and it has
 * to survive the row it describes being edited or deleted.
 *
 * Deliberately has no `updated_at` and no `deleted_at`: rows are written once
 * and never modified. That is the whole point.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('audit_logs', (table) => {
      table.string('id').primary()

      // Who. `actor_id` is a string so it can hold either an integer `users.id`
      // or a ULID customer id without a polymorphic join table.
      table.string('actor_type', 16).notNullable() // user | customer | worker | system
      table.string('actor_id').nullable()
      table.string('actor_label').nullable() // email/name at the time, kept if the actor is later deleted

      // What. Dotted verb, e.g. `order.refunded`, `gateway.credentials_updated`.
      table.string('action', 96).notNullable()
      table.string('subject_type', 64).nullable()
      table.string('subject_id').nullable()

      // Details, already filtered through the service's deny-list.
      table.jsonb('changes').notNullable().defaultTo('{}')

      // Money, denormalised so financial reports do not have to parse `changes`.
      table.bigInteger('amount').nullable()
      table.string('currency', 3).nullable()

      // Where from. The IP is hashed, not stored: it is enough to correlate
      // requests from one source without keeping a plaintext address.
      table.string('ip_hash', 64).nullable()
      table.string('user_agent', 512).nullable()
      table.string('request_id').nullable() // `config/app.ts` sets generateRequestId

      table.timestamp('created_at').notNullable()

      table.index(['subject_type', 'subject_id', 'created_at'], 'audit_logs_subject_index')
      table.index(['actor_type', 'actor_id', 'created_at'], 'audit_logs_actor_index')
      table.index(['action', 'created_at'], 'audit_logs_action_index')
    })
  }

  async down() {
    this.schema.dropTable('audit_logs')
  }
}
