import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('contents', (table) => {
      table.string('id').primary()
      table.string('title').notNullable()
      table.string('slug').notNullable().unique()
      table.text('body').notNullable().defaultTo('')
      table.string('status', 20).notNullable().defaultTo('DRAFT')
      table.integer('author_id').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('contents')
  }
}
