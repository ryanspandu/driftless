import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('plugins', (table) => {
      table.string('id').primary()
      table.string('name').notNullable().unique()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.string('version').nullable()
      table.timestamp('installed_at').nullable()
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable('plugins')
  }
}
