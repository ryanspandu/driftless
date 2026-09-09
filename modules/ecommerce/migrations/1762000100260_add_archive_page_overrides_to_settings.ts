import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Builder-page overrides for the category and tag archive screens.
 *
 * The same "use this page for X" arrangement as the other storefront screens:
 * null (the default) serves the built-in `/shop/category/:slug` and
 * `/shop/tag/:slug` Inertia archives; a published page id renders that page at
 * the archive's URL instead, with the slug bound so an archive block can filter
 * to that taxonomy. Custom-code blocks and template kits live inside such a
 * page, so this one pointer covers all three ways to customise the archive.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.string('category_page_id').nullable()
      table.string('tag_page_id').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_settings', (table) => {
      table.dropColumn('category_page_id')
      table.dropColumn('tag_page_id')
    })
  }
}
