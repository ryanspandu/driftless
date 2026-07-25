import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'media'

  async up() {
    const hasTitle = await this.schema.hasColumn(this.tableName, 'title')
    const hasDescription = await this.schema.hasColumn(this.tableName, 'description')
    const hasAlt = await this.schema.hasColumn(this.tableName, 'alt')
    const hasUpdatedAt = await this.schema.hasColumn(this.tableName, 'updated_at')

    this.schema.alterTable(this.tableName, (table) => {
      if (!hasTitle) table.string('title').nullable()
      if (!hasDescription) table.text('description').nullable()
      if (!hasAlt) table.string('alt').nullable()
      if (!hasUpdatedAt) table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('title')
      table.dropColumn('description')
      table.dropColumn('alt')
      table.dropColumn('updated_at')
    })
  }
}
