import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Shipping zones and flat-rate methods.
 *
 * Rates are computed by us rather than delegated to the gateway. Stripe
 * Checkout can collect an address and quote shipping, but PayPal has no
 * equivalent — delegating would mean the same basket produces different totals
 * depending on which button the buyer pressed. Computing here keeps the two
 * gateways identical and the calculation testable.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_shipping_zones', (table) => {
      table.string('id').primary()
      table.string('name').notNullable()

      /**
       * ISO 3166-1 alpha-2 codes this zone covers, as a JSON array. An empty
       * array means "everywhere else" — the catch-all zone, matched only when
       * no country-specific zone applies.
       */
      table.jsonb('countries').notNullable().defaultTo('[]')
      /** Optional state/province narrowing within those countries. */
      table.jsonb('states').notNullable().defaultTo('[]')

      table.integer('position').notNullable().defaultTo(0)
      table.boolean('enabled').notNullable().defaultTo(true)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['position'], 'ecom_shipping_zones_position_index')
    })

    this.schema.createTable('ecommerce_shipping_methods', (table) => {
      table.string('id').primary()
      table
        .string('zone_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_shipping_zones')
        .onDelete('CASCADE')

      table.string('name').notNullable() // "Standard", "Express"
      table.string('description').nullable()

      table.bigInteger('rate_amount').notNullable().defaultTo(0)
      /**
       * Order subtotal at or above which this method costs nothing. Null
       * disables free shipping for the method — distinct from `0`, which would
       * make everything free.
       */
      table.bigInteger('free_above_amount').nullable()

      table.integer('min_delivery_days').nullable()
      table.integer('max_delivery_days').nullable()

      table.boolean('enabled').notNullable().defaultTo(true)
      table.integer('position').notNullable().defaultTo(0)

      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()

      table.index(['zone_id', 'position'], 'ecom_shipping_methods_zone_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_shipping_methods')
    this.schema.dropTable('ecommerce_shipping_zones')
  }
}
