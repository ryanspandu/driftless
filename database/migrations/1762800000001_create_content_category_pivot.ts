import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('content_post_category', (table) => {
      table.string('content_id').notNullable().references('id').inTable('contents').onDelete('CASCADE')
      table
        .string('category_id')
        .notNullable()
        .references('id')
        .inTable('content_categories')
        .onDelete('CASCADE')
      table.primary(['content_id', 'category_id'])
    })
  }

  async down() {
    this.schema.dropTable('content_post_category')
  }
}
