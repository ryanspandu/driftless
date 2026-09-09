import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('content_post_tag', (table) => {
      table.string('content_id').notNullable().references('id').inTable('contents').onDelete('CASCADE')
      table.string('tag_id').notNullable().references('id').inTable('content_tags').onDelete('CASCADE')
      table.primary(['content_id', 'tag_id'])
    })
  }

  async down() {
    this.schema.dropTable('content_post_tag')
  }
}
