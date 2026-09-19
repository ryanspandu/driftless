import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_discounts', (table) => {
      /**
       * An "applied to all products" discount: no code to type, it reduces every
       * product's price on the storefront and in the basket automatically.
       */
      table.boolean('automatic').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_discounts', (table) => {
      table.dropColumn('automatic')
    })
  }
}
