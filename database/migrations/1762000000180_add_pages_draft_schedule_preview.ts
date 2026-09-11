import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Editor workflow columns on `pages`.
 *
 * - `draft_content` / `draft_seo` / `draft_updated_at`: staged, unpublished
 *   edits. Autosave writes here; Publish promotes them into the live
 *   `content`/`seo`. Editing a live page never changes it until Publish.
 * - `scheduled_publish_at` / `scheduled_unpublish_at`: a background command
 *   (`pages:run-schedule`) flips status when these fall due.
 * - `preview_token`: a shareable, no-login preview URL for a draft.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pages', (table) => {
      table.jsonb('draft_content').nullable()
      table.jsonb('draft_seo').nullable()
      table.timestamp('draft_updated_at').nullable()
      table.timestamp('scheduled_publish_at').nullable()
      table.timestamp('scheduled_unpublish_at').nullable()
      table.string('preview_token', 64).nullable().unique()
    })
  }

  async down() {
    this.schema.alterTable('pages', (table) => {
      table.dropColumn('draft_content')
      table.dropColumn('draft_seo')
      table.dropColumn('draft_updated_at')
      table.dropColumn('scheduled_publish_at')
      table.dropColumn('scheduled_unpublish_at')
      table.dropColumn('preview_token')
    })
  }
}
