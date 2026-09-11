import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Opt-in authenticator-app (TOTP) two-factor for admin accounts.
 *
 * The secret is stored **encrypted** (APP_KEY, purpose-tagged) — a database leak
 * must not hand over anyone's second factor. `two_factor_enabled_at` is null
 * while an enrolment is still pending confirmation, and set once a first valid
 * code proves the authenticator is configured. Recovery codes are a JSON array
 * of `{ hash, usedAt }` — single-use, so a used one is marked, not removed.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('users', (table) => {
      table.text('two_factor_secret_enc').nullable()
      table.timestamp('two_factor_enabled_at').nullable()
      table.jsonb('two_factor_recovery_codes').nullable()
    })
  }

  async down() {
    this.schema.alterTable('users', (table) => {
      table.dropColumn('two_factor_secret_enc')
      table.dropColumn('two_factor_enabled_at')
      table.dropColumn('two_factor_recovery_codes')
    })
  }
}
