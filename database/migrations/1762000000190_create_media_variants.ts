import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Responsive derivatives of an uploaded image.
 *
 * On upload we generate a few webp widths (see MediaService) so the builder can
 * emit a real `srcset` and browsers download an appropriately-sized image
 * instead of the full-resolution original on every device. Each derivative is
 * its own file/URL — required because media is served `immutable`, so a new
 * derivative can never reuse an existing URL.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('media_variants', (table) => {
      table.string('id').primary()
      table.string('media_id').notNullable().references('id').inTable('media').onDelete('CASCADE')
      table.integer('width').notNullable()
      table.integer('height').nullable()
      table.string('format', 16).notNullable() // 'webp'
      table.string('url').notNullable()
      table.integer('bytes').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable()

      table.index(['media_id'], 'media_variants_media_index')
    })
  }

  async down() {
    this.schema.dropTable('media_variants')
  }
}
