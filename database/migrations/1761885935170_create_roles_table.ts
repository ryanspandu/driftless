import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('roles', (table) => {
      table.string('id').primary()
      table.string('name', 64).notNullable().unique()
      table.text('description').nullable()
      table.boolean('is_system').notNullable().defaultTo(false)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })

    this.schema.createTable('permissions', (table) => {
      table.string('id').primary()
      table.string('name', 128).notNullable().unique()
      table.text('description').nullable()
      table.boolean('is_system').notNullable().defaultTo(false)
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })

    this.schema.createTable('role_user', (table) => {
      table.string('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.primary(['role_id', 'user_id'])
    })

    this.schema.createTable('permission_role', (table) => {
      table
        .string('permission_id')
        .notNullable()
        .references('id')
        .inTable('permissions')
        .onDelete('CASCADE')
      table
        .string('role_id')
        .notNullable()
        .references('id')
        .inTable('roles')
        .onDelete('CASCADE')
      table.primary(['permission_id', 'role_id'])
    })
  }

  async down() {
    this.schema.dropTable('permission_role')
    this.schema.dropTable('role_user')
    this.schema.dropTable('permissions')
    this.schema.dropTable('roles')
  }
}
