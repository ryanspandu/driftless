import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Custom-field storage for products.
 *
 * A PRODUCT-type CMS collection (the singleton "Product (ecommerce)" collection)
 * lets an operator add custom fields to every product without touching code —
 * exactly how a CONTENT-type collection extends the built-in Content editor. Their
 * values live here in `data`, coerced against the collection's schema on save and
 * resolved (relation ids → labels, media ids → urls) for the storefront, mirroring
 * `contents.data`. Nullable — a product with no custom fields stores null, not `{}`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.jsonb('data').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.dropColumn('data')
    })
  }
}
