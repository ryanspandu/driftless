import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('announcements', (table) => {
      table.string('id').primary()
      table.string('title').notNullable()
      table.text('body').notNullable().defaultTo('')
      table.boolean('published').notNullable().defaultTo(false)
      table
        .integer('created_by_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('announcements')
  }
}
