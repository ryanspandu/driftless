import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('tasks', (table) => {
      table.string('id').primary()
      table.string('title').notNullable()
      table.text('description').nullable()
      table.string('status').notNullable().defaultTo('TODO')
      table.string('priority').notNullable().defaultTo('MEDIUM')
      table.date('due_date').nullable()
      table
        .integer('assigned_user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
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
    this.schema.dropTable('tasks')
  }
}
