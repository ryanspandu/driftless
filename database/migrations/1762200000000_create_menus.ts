import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('menus', (table) => {
      table.string('id').primary()
      table.string('handle').notNullable().unique()
      table.string('name').notNullable()
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })

    this.schema.createTable('menu_items', (table) => {
      table.string('id').primary()
      table.string('menu_id').notNullable().references('id').inTable('menus').onDelete('CASCADE')
      // Self-reference for nesting. A deleted parent takes its subtree with it.
      table
        .string('parent_id')
        .nullable()
        .references('id')
        .inTable('menu_items')
        .onDelete('CASCADE')
      table.integer('position').notNullable().defaultTo(0)
      table.string('label').notNullable()
      // Item target kind: 'page' | 'url' | 'collection'. Stored as a plain string
      // (not a DB enum) so new kinds need no migration — mirrors templates.type.
      table.string('type', 20).notNullable().defaultTo('url')
      // Loose references (no hard FK): a page/record that later disappears just
      // resolves to '#' at render time rather than blocking a delete.
      table.string('page_id').nullable()
      table.string('url').nullable()
      table.string('collection_key').nullable()
      table.string('record_id').nullable()
      table.string('target', 10).notNullable().defaultTo('_self')
      // 'link' = a plain link; 'mega' = opens a popup panel built from children.
      table.string('open_mode', 10).notNullable().defaultTo('link')
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
      table.index(['menu_id', 'parent_id', 'position'])
    })
  }

  async down() {
    this.schema.dropTable('menu_items')
    this.schema.dropTable('menus')
  }
}
