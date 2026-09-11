import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Scopes a COLLECTION template to the CMS collection it is the item card for.
 *
 * Nullable: every other template type has no collection. Plain string rather
 * than a foreign key — collections are addressed by key everywhere else
 * (`collection_key` on page-builder blocks), and deleting a collection should
 * leave its templates in place to be re-bound, not cascade them away.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('templates', (table) => {
      table.string('collection_key').nullable()
    })
  }

  async down() {
    this.schema.alterTable('templates', (table) => {
      table.dropColumn('collection_key')
    })
  }
}
