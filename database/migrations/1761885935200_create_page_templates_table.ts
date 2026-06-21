import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('page_templates', (table) => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.jsonb('content').notNullable().defaultTo('{}')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('page_templates')
  }
}
