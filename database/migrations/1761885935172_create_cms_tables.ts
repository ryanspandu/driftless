import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasTable('cms_collections'))) {
      this.schema.createTable('cms_collections', (table) => {
        table.string('id').primary()
        table.string('key', 64).notNullable().unique()
        table.string('label').notNullable()
        table.string('icon').nullable()
        table.string('group').nullable()
        table.string('source', 20).notNullable().defaultTo('DYNAMIC')
        table.string('model_name').nullable()
        table.string('table_name').nullable()
        table.text('list_config').notNullable().defaultTo('{}')
        table.boolean('revisions_on').notNullable().defaultTo(true)
        table.boolean('drafts_on').notNullable().defaultTo(true)
        table.timestamp('deleted_at').nullable()
        table.timestamps(true, true)
      })
    }

    if (!(await this.schema.hasTable('cms_fields'))) {
      this.schema.createTable('cms_fields', (table) => {
        table.string('id').primary()
        table
          .string('collection_id')
          .notNullable()
          .references('id')
          .inTable('cms_collections')
          .onDelete('CASCADE')
        table.string('key', 64).notNullable()
        table.string('label').notNullable()
        table.string('type', 20).notNullable()
        table.boolean('required').notNullable().defaultTo(false)
        table.boolean('unique').notNullable().defaultTo(false)
        table.integer('order').notNullable().defaultTo(0)
        table.text('config').notNullable().defaultTo('{}')
        table.timestamp('deleted_at').nullable()
        table.timestamps(true, true)
        table.unique(['collection_id', 'key'])
      })
    }

    if (!(await this.schema.hasTable('cms_revisions'))) {
      this.schema.createTable('cms_revisions', (table) => {
        table.string('id').primary()
        table.string('collection_key', 64).notNullable()
        table.string('record_id').notNullable()
        table.text('data').notNullable()
        table.string('status', 20).notNullable().defaultTo('DRAFT')
        table.integer('author_id').nullable()
        table.timestamp('deleted_at').nullable()
        table.timestamp('created_at').notNullable()
        table.index(['collection_key', 'record_id', 'created_at'])
      })
    }

    if (!(await this.schema.hasTable('media'))) {
      this.schema.createTable('media', (table) => {
        table.string('id').primary()
        table.string('filename').notNullable()
        table.string('mime_type', 128).notNullable()
        table.integer('size').notNullable()
        table.string('url').notNullable()
        table.integer('width').nullable()
        table.integer('height').nullable()
        table.integer('author_id').nullable()
        table.timestamp('deleted_at').nullable()
        table.timestamp('created_at').notNullable()
      })
    }
  }

  async down() {
    this.schema.dropTable('media')
    this.schema.dropTable('cms_revisions')
    this.schema.dropTable('cms_fields')
    this.schema.dropTable('cms_collections')
  }
}
