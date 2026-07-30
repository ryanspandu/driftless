import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Store configuration and payment gateway credentials.
 *
 * Migration prefixes in this module start at 1762000100000, comfortably after
 * core's highest (1761885935500). Ordering matters because `naturalSort` sorts
 * per directory and concatenates directories in `config/database.ts` path
 * order, so anything referencing `users` must land after core's migrations.
 */
export default class extends BaseSchema {
  async up() {
    /**
     * Single-row store configuration, id `default`.
     *
     * Money is stored as `BIGINT` minor units throughout this module — see
     * `modules/ecommerce/services/money.ts`. There is not a single float
     * anywhere in the schema.
     */
    this.schema.createTable('ecommerce_settings', (table) => {
      table.string('id').primary()

      table.string('store_name').nullable()
      table.string('store_email').nullable()
      table.string('support_email').nullable()

      // Store address, used on receipts and for tax context.
      table.string('address_line1').nullable()
      table.string('address_line2').nullable()
      table.string('city').nullable()
      table.string('state').nullable()
      table.string('postal_code', 32).nullable()
      table.string('country', 2).nullable() // ISO 3166-1 alpha-2

      // ISO 4217. Single-currency for now; every order records its own currency
      // so multi-currency is a price-list problem later, not a migration.
      table.string('currency', 3).notNullable().defaultTo('USD')
      table.string('locale', 16).notNullable().defaultTo('en-US')

      // Tax as a percentage with up to 4 decimals, stored as basis points ×100
      // (i.e. 8.25% -> 82500) so the rate itself is never a float either.
      table.integer('tax_rate_micro').notNullable().defaultTo(0)
      // When true, listed prices already contain tax and it is backed out for
      // display rather than added at checkout.
      table.boolean('tax_inclusive').notNullable().defaultTo(false)
      table.string('tax_label', 32).notNullable().defaultTo('Tax')

      // How long an unpaid order holds its stock reservation.
      table.integer('checkout_ttl_minutes').notNullable().defaultTo(60)
      // How long after payment a refund is still expected, before affiliate
      // commissions are approved for payout.
      table.integer('refund_window_days').notNullable().defaultTo(30)
      // Last-click attribution window for affiliate referrals.
      table.integer('affiliate_cookie_days').notNullable().defaultTo(30)

      table.text('order_number_prefix').notNullable().defaultTo('ORD-')

      table.timestamps(true, true)
    })

    /**
     * Gateway API credentials.
     *
     * One row per (gateway, mode) so test and live keys coexist and a test key
     * can never settle a live payment. Secrets are AES-256-GCM ciphertext via
     * `config/encryption.ts`, each bound to a distinct purpose so a value
     * cannot be moved between columns.
     */
    this.schema.createTable('ecommerce_gateway_credentials', (table) => {
      table.string('id').primary()

      table.string('gateway', 32).notNullable() // stripe | paypal
      table.string('mode', 8).notNullable() // test | live

      // Publishable/client id — public by design, stored in the clear.
      table.string('public_key').nullable()
      table.text('secret_key_enc').nullable()
      table.text('webhook_secret_enc').nullable()

      table.boolean('enabled').notNullable().defaultTo(false)
      table.timestamp('connected_at').nullable()
      table.timestamp('last_verified_at').nullable()
      table.string('last_verify_error', 512).nullable()

      table.timestamps(true, true)

      table.unique(['gateway', 'mode'])
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_gateway_credentials')
    this.schema.dropTable('ecommerce_settings')
  }
}
