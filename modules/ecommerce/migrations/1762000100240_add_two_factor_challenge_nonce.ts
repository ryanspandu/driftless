import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A per-account nonce that makes the 2FA login-challenge token single-use.
 *
 * The pending token handed back after the password step is a stateless,
 * APP_KEY-encrypted, self-expiring blob. Unforgeable, but replayable within its
 * 10-minute window. Binding it to a nonce that is rotated the moment a
 * challenge is issued (and cleared when it is spent) means a captured token can
 * no longer be replayed: the next issue, or a completed verification, leaves
 * its nonce stale.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_accounts', (table) => {
      table.string('two_factor_challenge_nonce').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_accounts', (table) => {
      table.dropColumn('two_factor_challenge_nonce')
    })
  }
}
