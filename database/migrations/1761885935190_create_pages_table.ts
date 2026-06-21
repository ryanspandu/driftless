import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('pages', (table) => {
      table.string('id').primary()
      table.string('title').notNullable()
      table.string('path').notNullable().unique()
      table.string('status', 20).notNullable().defaultTo('DRAFT')
      table.string('render_mode', 20).notNullable().defaultTo('SSR')
      table.jsonb('content').notNullable().defaultTo('{}')
      table.text('rendered_html').nullable()
      table.jsonb('seo').notNullable().defaultTo('{}')
      table.integer('author_id').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.timestamp('published_at').nullable()
      table.timestamps(true, true)
      table.timestamp('deleted_at').nullable()
    })

    this.schema.createTable('page_revisions', (table) => {
      table.string('id').primary()
      table.string('page_id').notNullable()
      table.jsonb('content').notNullable().defaultTo('{}')
      table.jsonb('seo').notNullable().defaultTo('{}')
      table.string('status', 20).notNullable().defaultTo('DRAFT')
      table.integer('author_id').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['page_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable('page_revisions')
    this.schema.dropTable('pages')
  }
}
