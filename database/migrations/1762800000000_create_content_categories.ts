import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('content_categories', (table) => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.string('slug').notNullable().unique()
      table.text('description').nullable()
      table
        .string('parent_id')
        .nullable()
        .references('id')
        .inTable('content_categories')
        .onDelete('SET NULL')
      table.integer('position').notNullable().defaultTo(0)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('content_categories')
  }
}
