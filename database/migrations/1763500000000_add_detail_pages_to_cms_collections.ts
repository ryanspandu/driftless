import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cms_collections'

  async up() {
    const hasOn = await this.schema.hasColumn(this.tableName, 'detail_pages_on')

    this.schema.alterTable(this.tableName, (table) => {
      // "Public detail pages": when on, every PUBLISHED record of the collection is
      // served at `/<detail_path_prefix>/<slug>` and rendered through the template
      // page `detail_page_id`. Off by default — nothing is exposed until enabled.
      if (!hasOn) {
        table.boolean('detail_pages_on').notNullable().defaultTo(false)
        table.string('detail_path_prefix', 64).nullable()
        // A Page id. No FK on purpose: pages are soft-deleted and a missing or
        // draft template simply makes the detail URLs 404.
        table.string('detail_page_id').nullable()
      }
    })

    // One prefix, one collection (trashed collections and unset prefixes don't
    // count). Outside the column guard and IF NOT EXISTS, so a half-applied earlier
    // run still ends up with the index.
    this.schema.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS cms_collections_detail_prefix_unique ON cms_collections (detail_path_prefix) WHERE detail_path_prefix IS NOT NULL AND deleted_at IS NULL'
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS cms_collections_detail_prefix_unique')
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('detail_pages_on')
      table.dropColumn('detail_path_prefix')
      table.dropColumn('detail_page_id')
    })
  }
}
