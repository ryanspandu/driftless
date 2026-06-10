import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('username', 64).nullable().unique()
      table.string('first_name').nullable()
      table.string('last_name').nullable()
      table.string('phone').nullable()
      table.text('address').nullable()
      table.timestamp('email_verified_at').nullable()
      table.string('status', 20).notNullable().defaultTo('ACTIVE')
      table.string('google_sub').nullable().unique()
      table.timestamp('deleted_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('username')
      table.dropColumn('first_name')
      table.dropColumn('last_name')
      table.dropColumn('phone')
      table.dropColumn('address')
      table.dropColumn('email_verified_at')
      table.dropColumn('status')
      table.dropColumn('google_sub')
      table.dropColumn('deleted_at')
    })
  }
}
