import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.integer('external_clicks_count').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.dropColumn('external_clicks_count')
    })
  }
}
