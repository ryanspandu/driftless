import { BaseSchema } from '@adonisjs/lucid/schema'

/** Flat product tags + the product↔tag pivot. */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('ecommerce_tags', (table) => {
      table.string('id').primary()
      table.string('slug', 160).notNullable().unique()
      table.string('name').notNullable()
      table.text('description').nullable()
      table.string('image_url').nullable()
      table.integer('position').notNullable().defaultTo(0)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })

    this.schema.createTable('ecommerce_product_tags', (table) => {
      table
        .string('product_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_products')
        .onDelete('CASCADE')
      table
        .string('tag_id')
        .notNullable()
        .references('id')
        .inTable('ecommerce_tags')
        .onDelete('CASCADE')
      table.primary(['product_id', 'tag_id'])
    })
  }

  async down() {
    this.schema.dropTable('ecommerce_product_tags')
    this.schema.dropTable('ecommerce_tags')
  }
}
