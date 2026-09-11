import { BaseSchema } from '@adonisjs/lucid/schema'

/** Shopping carts and their lines. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_carts', (table) => {
      table.string('id').primary()

      /**
       * Only the hash of the cart token is stored. The plaintext lives in a
       * signed, httpOnly cookie on the browser. Storing the raw token would let
       * anyone with database read access take over any live cart, and cart ids
       * being guessable is exactly how "someone else's basket" bugs happen.
       */
      table.string('token_hash', 64).notNullable().unique()

      table
        .string('customer_id')
        .nullable()
        .references('id')
        .inTable('ecommerce_customers')
        .onDelete('SET NULL')

      table.string('currency', 3).notNullable().defaultTo('USD')
      table.string('email', 254).nullable()

      // Referral attribution captured when the cart is created, so a discount
      // or commission is decided by what the buyer actually arrived through.
      table.string('affiliate_code', 64).nullable()
      table.string('discount_code', 64).nullable()

      table.timestamp('expires_at').notNullable()
      table.timestamps(true, true)

      table.index(['expires_at'], 'ecom_carts_expiry_index')
      table.index(['customer_id'], 'ecom_carts_customer_index')
    })

    this.schema.createTable('ecommerce_cart_items', (table) => {
      table.string('id').primary()
      table
        .string('cart_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_carts')
        .onDelete('CASCADE')
      table
        .string('variant_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_product_variants')
        .onDelete('CASCADE')

      table.integer('quantity').notNullable().defaultTo(1)

      /**
       * There is deliberately **no price column here**.
       *
       * A cart holds intent — what and how many — and nothing else. Every
       * amount is recomputed from the variant at checkout time, which is what
       * makes "the client never sends a price" true rather than aspirational:
       * there is no stored figure for a tampered request to influence.
       */

      table.timestamps(true, true)

      // One line per variant per cart; adding the same variant twice bumps the
      // quantity rather than creating a second row.
      table.unique(['cart_id', 'variant_id'])
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_cart_items')
    this.schema.dropTable('ecommerce_carts')
  }
}
