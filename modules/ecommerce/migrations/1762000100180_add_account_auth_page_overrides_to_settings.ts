import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Builder-page overrides for the shopper sign-in and sign-up screens.
 *
 * The same "use this page for X" arrangement as the other storefront screens:
 * null (the default) serves the built-in `/shop/account/login` and
 * `/shop/account/register` screens; a published page id renders that page at the
 * screen's URL instead.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.string('login_page_id').nullable()
      table.string('register_page_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.dropColumn('login_page_id')
      table.dropColumn('register_page_id')
    })
  }
}
