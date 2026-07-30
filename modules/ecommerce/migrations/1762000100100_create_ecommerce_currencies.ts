import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Selling in more than one currency.
 *
 * Two tables, and the design decision behind both is the same one: **prices are
 * listed, never converted.** There is no exchange rate anywhere in this module.
 * A merchant states what a variant costs in each currency they sell in, which
 * means no rate source to go stale, no floating-point FX arithmetic, and prices
 * that can be rounded to whatever looks right in each market rather than
 * landing on €9.37.
 *
 * The consequence is deliberate: a variant with no price in a currency is **not
 * sellable in that currency**. Falling back to the base price would be a silent
 * mispricing, and a spectacular one — `Money` stores minor units, so a base
 * price of `1000` means $10.00 in USD and ¥1000 in JPY. Roughly a 30% error,
 * applied invisibly. Nothing in this module may convert between currencies.
 */
export default class extends BaseSchema {
  async up() {
    /**
     * Currencies the storefront may be switched to.
     *
     * The store's **base** currency lives in `ecommerce_settings.currency` and
     * is always available whether or not it has a row here — so an empty table
     * means "single-currency store", which is exactly how every existing
     * installation already behaves.
     */
    this.schema.createTable('ecommerce_currencies', (table) => {
      table.string('id').primary()
      table.string('code', 3).notNullable().unique()
      table.boolean('enabled').notNullable().defaultTo(true)
      /** Sort order in the storefront's currency picker. */
      table.integer('position').notNullable().defaultTo(0)
      table.timestamps(true, true)
    })

    /**
     * What a variant costs in a currency that is not the base.
     *
     * The base price stays on `ecommerce_product_variants.price_amount` — no
     * data migration, and a single-currency store never touches this table.
     * The asymmetry is intentional: it keeps the common path identical to what
     * it was, rather than rewriting every existing price into a new table for
     * the sake of symmetry.
     */
    this.schema.createTable('ecommerce_variant_prices', (table) => {
      table.string('id').primary()
      table
        .string('variant_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_product_variants')
        .onDelete('CASCADE')
      table.string('currency', 3).notNullable()
      table.bigInteger('price_amount').notNullable()
      table.bigInteger('compare_at_amount').nullable()
      table.timestamps(true, true)

      /** One price per variant per currency — the whole point of the table. */
      table.unique(['variant_id', 'currency'])
      table.index(['currency'], 'ecom_variant_prices_currency_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_variant_prices')
    this.schema.dropTable('ecommerce_currencies')
  }
}
