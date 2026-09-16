import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A second Google sign-in toggle, independent from `google_auth_enabled`
 * (the core admin one): lets the storefront's customer login/register expose
 * "Continue with Google" without also turning it on for admin, or vice versa.
 * Both share the one stored OAuth credential — see `resolveGoogleOAuth`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('integration_settings', (table) => {
      table.boolean('google_auth_enabled_for_shop').notNullable().defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable('integration_settings', (table) => {
      table.dropColumn('google_auth_enabled_for_shop')
    })
  }
}
