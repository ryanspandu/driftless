import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The note an applicant leaves when applying (or re-applying after a rejection),
 * so an admin can see why they should be approved.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_affiliates', (table) => {
      table.text('applicant_message').nullable()
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_affiliates', (table) => {
      table.dropColumn('applicant_message')
    })
  }
}
