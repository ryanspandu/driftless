import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Single-use tokens behind the "forgot password" flow.
 *
 * Only the SHA-256 of each token is stored. A leaked database dump is then a
 * list of hashes rather than a set of working account-takeover links, and the
 * plaintext exists exactly once — in the email that was sent.
 *
 * `user_id` is an integer because `users.id` is an auto-increment column, not a
 * ULID like most other tables here. The row's own `id` is a ULID, matching the
 * rest of the schema.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('password_reset_tokens', (table) => {
      table.string('id').primary()

      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')

      // Hex SHA-256 is always 64 chars. Unique so a lookup is an index hit and
      // a collision is a write error rather than an ambiguous match.
      table.string('token_hash', 64).notNullable().unique()

      table.timestamp('expires_at').notNullable()

      // Single use. Set on consumption rather than deleting the row, so a
      // second click on the same link can be told apart from a link that never
      // existed if that distinction is ever wanted.
      table.timestamp('used_at').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['user_id'], 'password_reset_tokens_user_index')
      table.index(['expires_at'], 'password_reset_tokens_expires_index')
    })
  }

  async down() {
    this.schema.dropTable('password_reset_tokens')
  }
}
