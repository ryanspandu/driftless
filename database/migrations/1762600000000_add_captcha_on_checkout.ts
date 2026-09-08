import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A third CAPTCHA toggle, alongside `captcha_on_login` / `captcha_on_register`.
 *
 * The storefront checkout is the card-testing surface, but a challenge there
 * adds friction to the buy path — so it is opt-in (defaults off) and, unlike
 * login/register, only takes effect for an invisible-capable provider
 * (Turnstile). See `CaptchaService.isInvisibleCapable`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('integration_settings', (table) => {
      table.boolean('captcha_on_checkout').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('integration_settings', (table) => {
      table.dropColumn('captcha_on_checkout')
    })
  }
}
