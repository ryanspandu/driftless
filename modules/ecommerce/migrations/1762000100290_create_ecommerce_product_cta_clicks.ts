import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_product_cta_clicks', (table) => {
      table.string('id').primary()
      table.string('product_id').notNullable()
      /** A snapshot of the product's `external_url` at click time — the admin
       *  can edit/remove it later, but the click log should still show what
       *  the shopper was actually sent to. */
      table.string('url', 500).notNullable()
      table.string('referrer', 512).nullable()
      table.string('ip_hash', 64).nullable()
      table.string('user_agent', 512).nullable()
      table.timestamp('created_at').notNullable()

      table.index(['product_id', 'created_at'], 'ecom_product_cta_clicks_index')
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_product_cta_clicks')
  }
}
