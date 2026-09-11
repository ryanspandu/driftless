import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cms_collections'

  async up() {
    const hasType = await this.schema.hasColumn(this.tableName, 'type')

    this.schema.alterTable(this.tableName, (table) => {
      // COLLECTION = today's dynamic collections (own table). CONTENT = a
      // metadata-only collection whose fields extend the built-in Content.
      if (!hasType) table.string('type', 20).notNullable().defaultTo('COLLECTION')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('type')
    })
  }
}
