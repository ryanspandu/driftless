import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * URL redirects (301/302).
 *
 * Moving a builder page changes its `path`, and the old URL used to 404 with
 * nothing recorded — dead links and lost ranking. This table maps an old path
 * to a new destination; the public catch-all consults it before giving up, and
 * `PagesService.update` auto-captures one whenever a published page's path
 * changes. Operators can also add/edit redirects by hand.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('redirects', (table) => {
      table.string('id').primary()
      // Normalised (no leading/trailing slash), matched against the request path.
      table.string('from_path', 512).notNullable().unique()
      // Destination: a site path (with or without leading slash) or absolute URL.
      table.string('to_path', 2048).notNullable()
      table.integer('status').notNullable().defaultTo(301) // 301 | 302
      table.integer('hits').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('redirects')
  }
}
