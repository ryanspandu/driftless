import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'contents'

  async up() {
    const hasData = await this.schema.hasColumn(this.tableName, 'data')
    const hasFeatured = await this.schema.hasColumn(this.tableName, 'featured_image')

    this.schema.alterTable(this.tableName, (table) => {
      // Custom fields defined by the Content-type collection, stored as one JSON
      // blob (TEXT, round-tripped by the model) — mirrors `cms_collections.list_config`.
      if (!hasData) table.text('data').nullable()
      // Native featured image / thumbnail: a media URL (`/uploads/…`).
      if (!hasFeatured) table.string('featured_image').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('data')
      table.dropColumn('featured_image')
    })
  }
}
