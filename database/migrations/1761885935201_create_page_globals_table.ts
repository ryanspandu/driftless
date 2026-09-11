import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('page_globals', (table) => {
      table.string('key').primary()
      table.jsonb('content').notNullable().defaultTo('{}')
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable('page_globals')
  }
}
