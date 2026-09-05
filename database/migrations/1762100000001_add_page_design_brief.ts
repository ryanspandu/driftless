import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A structured design brief per page — the palette, fonts, icon style and the
 * design's sections + asset slots the AI records before building, so
 * check_design_coverage can compare the built page against what the reference
 * shows. Nullable JSON; existing pages are untouched.
 */
export default class extends BaseSchema {
  protected tableName = 'pages'

  async up() {
    const has = await this.schema.hasColumn(this.tableName, 'design_brief')
    if (!has) {
      this.schema.alterTable(this.tableName, (table) => {
        table.json('design_brief').nullable()
      })
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('design_brief')
    })
  }
}
