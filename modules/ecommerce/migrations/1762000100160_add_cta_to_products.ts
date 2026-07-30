import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What a product's buy button actually does.
 *
 * Three modes:
 *
 * - `add_to_cart` — the default, and what every existing product keeps.
 * - `buy_now` — straight to checkout with just this item, skipping the basket.
 * - `external` — the button is a **link somewhere else**. The shop does not
 *   sell this; it points at whoever does, which is how an affiliate listing
 *   works.
 *
 * `external` is the one with teeth. Such a product has no stock, no price this
 * shop can charge, and must never reach a basket or an order — a listing the
 * store cannot fulfil becoming an order it cannot ship is the failure this
 * exists to prevent, and the guard for it lives in the cart and pricing
 * services, not in whether the UI drew a button.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.string('cta_mode', 16).notNullable().defaultTo('add_to_cart')

      /**
       * Where an `external` product sends the visitor. Validated as `http(s)`
       * before it is stored — this URL is rendered as a link a buyer clicks, so
       * a `javascript:` value here would be stored XSS.
       */
      table.string('external_url', 500).nullable()

      /** Button text, e.g. "Buy on Amazon". Falls back to a generic label. */
      table.string('external_label', 80).nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.dropColumn('cta_mode')
      table.dropColumn('external_url')
      table.dropColumn('external_label')
    })
  }
}
