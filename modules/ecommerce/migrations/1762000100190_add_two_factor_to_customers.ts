import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Opt-in authenticator-app (TOTP) two-factor for storefront customers.
 *
 * Same shape and reasoning as the admin `users` columns: the secret is stored
 * encrypted (APP_KEY, purpose-tagged), `two_factor_enabled_at` is null until a
 * first code confirms enrolment, and recovery codes are a single-use
 * `{ hash, usedAt }` JSON array.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_customers', (table) => {
      table.text('two_factor_secret_enc').nullable()
      table.timestamp('two_factor_enabled_at').nullable()
      table.jsonb('two_factor_recovery_codes').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_customers', (table) => {
      table.dropColumn('two_factor_secret_enc')
      table.dropColumn('two_factor_enabled_at')
      table.dropColumn('two_factor_recovery_codes')
    })
  }
}
