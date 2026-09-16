import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Two more CAPTCHA toggles, alongside `captcha_on_login/register/checkout`:
 * the generic builder Forms pipeline (`POST /api/forms/submit`, the endpoint
 * any template-kit contact form can post to) and the storefront cart
 * discount-code apply/check endpoints. Both default off, like every other
 * CAPTCHA flag here.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('integration_settings', (table) => {
      table.boolean('captcha_on_forms').notNullable().defaultTo(false)
      table.boolean('captcha_on_discount').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('integration_settings', (table) => {
      table.dropColumn('captcha_on_forms')
      table.dropColumn('captcha_on_discount')
    })
  }
}
