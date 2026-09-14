import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Kit-author-declared "content fields" for a CODE page whose resolved
 * template has no real `<BuilderRegion/>` — a small set of text/image/video/
 * setting values the admin can edit without full Puck block composition. See
 * `KitCapability` (`inertia/custom/types.ts`) and `resolveCustomPageCapability`
 * (`inertia/custom/registry.ts`).
 *
 * Same staged-draft shape as `content`/`draft_content`: autosave writes
 * `draft_content_fields`, Publish promotes it into `content_fields`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pages', (table) => {
      table.jsonb('content_fields').nullable()
      table.jsonb('draft_content_fields').nullable()
    })
  }

  async down() {
    this.schema.alterTable('pages', (table) => {
      table.dropColumn('content_fields')
      table.dropColumn('draft_content_fields')
    })
  }
}
