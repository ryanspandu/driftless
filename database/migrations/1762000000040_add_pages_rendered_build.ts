import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Stamp each SSG snapshot with the build that produced it.
 *
 * The snapshot embeds hashed asset URLs, so a snapshot outlives the build whose
 * chunks it references and then serves a page pointing at files that were
 * pruned. Clearing every snapshot once after a deploy cannot fix this: with a
 * rolling restart the old workers are still running, and the first SSG request
 * they serve writes an old-hash snapshot straight back in.
 *
 * Comparing on read removes the race entirely. A mismatch is simply a cache
 * miss — the same path a null snapshot already takes — and it repairs itself.
 *
 * Nullable with no backfill on purpose: every existing snapshot has an unknown
 * build, which must read as "does not match" so it is re-rendered once.
 */
export default class extends BaseSchema {
  protected tableName = 'pages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('rendered_build').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('rendered_build')
    })
  }
}
