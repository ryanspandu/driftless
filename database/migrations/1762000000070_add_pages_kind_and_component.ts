import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A page can be a builder document **or** a hand-written React component.
 *
 * `kind` discriminates the two; `component` names the custom page for a CODE
 * row. It holds a **slug**, not an Inertia page name — the renderer looks that
 * slug up in a glob scoped to `inertia/custom/pages/`, so a row can never point
 * at an arbitrary component such as an admin screen.
 *
 * Defaulted to BUILDER with no backfill needed: every page that exists today is
 * a Puck document, and the default keeps it that way without touching a row.
 */
export default class extends BaseSchema {
  protected tableName = 'pages'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('kind', 20).notNullable().defaultTo('BUILDER')
      table.string('component').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('kind')
      table.dropColumn('component')
    })
  }
}
