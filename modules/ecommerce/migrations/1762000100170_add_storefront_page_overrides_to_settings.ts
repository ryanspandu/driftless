import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Optional builder-page overrides for the storefront application screens.
 *
 * Cart, checkout, order status and the account/profile page are fixed
 * per-visitor screens by default. Each of these columns, when set to a
 * published builder page, makes that page render at the screen's URL instead —
 * the same "use this page for X" arrangement `shop_page_id` / `product_page_id`
 * already provide for the catalogue.
 *
 * Null (the default, and the state of every installation before this column)
 * means the built-in fixed screen is served, exactly as before.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.string('cart_page_id').nullable()
      table.string('checkout_page_id').nullable()
      table.string('order_page_id').nullable()
      table.string('account_page_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.dropColumn('cart_page_id')
      table.dropColumn('checkout_page_id')
      table.dropColumn('order_page_id')
      table.dropColumn('account_page_id')
    })
  }
}
