import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasTable('cms_components'))) {
      this.schema.createTable('cms_components', (table) => {
        table.string('id').primary()
        table.string('key', 64).notNullable().unique()
        table.string('label').notNullable()
        table.text('icon').nullable()
        table.text('fields').notNullable().defaultTo('[]')
        table.timestamps(true, true)
        table.timestamp('deleted_at').nullable()
      })
    }
  }

  async down() {
    this.schema.dropTable('cms_components')
  }
}
