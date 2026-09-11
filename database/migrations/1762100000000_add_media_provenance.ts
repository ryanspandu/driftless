import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Media provenance: where a media row's bytes came from. Lets the builder-API
 * distinguish an operator upload from a URL fetch, a crop of another asset, a
 * design reference, or a labelled placeholder — so the MCP flow can steer away
 * from (and report) stock-photo substitution, and `crop_media` can link back to
 * its source. All nullable/defaulted so existing rows are untouched.
 */
export default class extends BaseSchema {
  protected tableName = 'media'

  async up() {
    const hasOrigin = await this.schema.hasColumn(this.tableName, 'origin')
    const hasSourceUrl = await this.schema.hasColumn(this.tableName, 'source_url')
    const hasSourceMediaId = await this.schema.hasColumn(this.tableName, 'source_media_id')

    this.schema.alterTable(this.tableName, (table) => {
      // 'upload' (multipart) | 'url' (fetched) | 'crop' (from another asset) |
      // 'reference' (a design mockup) | 'placeholder' (a labelled stand-in).
      if (!hasOrigin) table.string('origin').notNullable().defaultTo('upload')
      if (!hasSourceUrl) table.string('source_url', 1024).nullable()
      if (!hasSourceMediaId) table.string('source_media_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('origin')
      table.dropColumn('source_url')
      table.dropColumn('source_media_id')
    })
  }
}
