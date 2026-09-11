import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Removes the legacy `page_globals` and `page_templates` tables, superseded by the
 * unified `templates` table (data was copied across in 1761885935210). `down()`
 * recreates the empty schemas for reversibility (original rows are not restored).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('page_globals')
    this.schema.dropTableIfExists('page_templates')
  }

  async down() {
    this.schema.createTable('page_globals', (table) => {
      table.string('key').primary()
      table.jsonb('content').notNullable().defaultTo('{}')
      table.timestamp('updated_at').nullable()
    })
    this.schema.createTable('page_templates', (table) => {
      table.string('id').primary()
      table.string('name').notNullable()
      table.jsonb('content').notNullable().defaultTo('{}')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })
  }
}
