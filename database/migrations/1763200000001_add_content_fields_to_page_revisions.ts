import { BaseSchema } from '@adonisjs/lucid/schema'

/** Snapshot column mirroring the new `pages.content_fields`, so restoring an
 *  old revision doesn't silently drop kit-declared field edits. */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('page_revisions', (table) => {
      table.jsonb('content_fields').nullable()
    })
  }

  async down() {
    this.schema.alterTable('page_revisions', (table) => {
      table.dropColumn('content_fields')
    })
  }
}
