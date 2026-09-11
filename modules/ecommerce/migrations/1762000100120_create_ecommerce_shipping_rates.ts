import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What a shipping method costs in a currency that is not the store's base.
 *
 * The same rule as `ecommerce_variant_prices`, for the same reason: amounts are
 * minor units, so reusing the base rate for another currency would read a `500`
 * meaning $5.00 as ¥500. Rates are **listed, never converted**, and a method
 * with no rate in the order's currency is simply not offered for that order.
 *
 * The base rate stays on `ecommerce_shipping_methods.rate_amount`, so a
 * single-currency store never touches this table.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_shipping_rates', (table) => {
      table.string('id').primary()
      table
        .string('method_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_shipping_methods')
        .onDelete('CASCADE')

      table.string('currency', 3).notNullable()
      table.bigInteger('rate_amount').notNullable().defaultTo(0)
      /** Null disables free shipping for this currency — distinct from `0`. */
      table.bigInteger('free_above_amount').nullable()

      table.timestamps(true, true)
      table.unique(['method_id', 'currency'])
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_shipping_rates')
  }
}
