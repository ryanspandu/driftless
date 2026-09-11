import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Non-secret, gateway-specific settings.
 *
 * Stripe and PayPal need only the key columns. Lemon Squeezy (Merchant of
 * Record) also needs a store id + variant id — the catch-all product a
 * custom-priced checkout is created against — which have no home in the fixed
 * key columns. Stored in the clear like `public_key`: no secret lives here.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_gateway_credentials', (table) => {
      table.jsonb('config').notNullable().defaultTo('{}')
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_gateway_credentials', (table) => {
      table.dropColumn('config')
    })
  }
}
