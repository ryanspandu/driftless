import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Which builder page is the shop front.
 *
 * `/shop` is a reserved first segment, so a CMS page at that path would never
 * render through the catch-all. The module serves it explicitly instead — the
 * same arrangement as `/shop/p/:slug` — and this column says which page to use.
 *
 * Null means no shop front, and `/shop` 404s. That is the state of every
 * installation that existed before this column, and nothing about it is broken.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.string('shop_page_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.dropColumn('shop_page_id')
    })
  }
}
