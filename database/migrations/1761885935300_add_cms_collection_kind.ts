import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cms_collections'

  async up() {
    const hasKind = await this.schema.hasColumn(this.tableName, 'kind')

    this.schema.alterTable(this.tableName, (table) => {
      if (!hasKind) table.string('kind').notNullable().defaultTo('collection')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('kind')
    })
  }
}
