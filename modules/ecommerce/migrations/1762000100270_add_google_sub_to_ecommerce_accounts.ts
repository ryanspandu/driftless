import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_accounts', (table) => {
      table.string('google_sub').nullable().unique()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_accounts', (table) => {
      table.dropColumn('google_sub')
    })
  }
}
