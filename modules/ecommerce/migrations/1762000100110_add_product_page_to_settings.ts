import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Which builder page is the product-detail template.
 *
 * One designed page serves every product. Without this a catalogue of any size
 * means one builder page per product, which stops being workable at about the
 * tenth one.
 *
 * No foreign key on purpose: `pages` is core's table, and a module reaching
 * into core's schema with a constraint would make core undeployable without the
 * module. The id is resolved at render time and a missing page is handled as a
 * 404, which is the same outcome a dangling FK would have produced anyway.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.string('product_page_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.dropColumn('product_page_id')
    })
  }
}
