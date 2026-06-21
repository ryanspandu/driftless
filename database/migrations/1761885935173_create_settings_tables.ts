import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    if (!(await this.schema.hasTable('web_settings'))) {
      this.schema.createTable('web_settings', (table) => {
        table.string('id').primary()
        table.string('section', 64).notNullable()
        table.string('key', 128).notNullable()
        table.text('value').notNullable()
        table.timestamp('updated_at').notNullable()
        table.timestamp('deleted_at').nullable()
        table.unique(['section', 'key'])
        table.index(['section'])
      })
    }

    if (!(await this.schema.hasTable('integration_settings'))) {
      this.schema.createTable('integration_settings', (table) => {
        table.string('id').primary().defaultTo('default')
        table.boolean('google_auth_enabled').notNullable().defaultTo(false)
        table.string('google_client_id').nullable()
        table.text('google_client_secret_enc').nullable()
        table.boolean('captcha_enabled').notNullable().defaultTo(false)
        table.string('captcha_provider').nullable()
        table.string('captcha_site_key').nullable()
        table.text('captcha_secret_enc').nullable()
        table.boolean('captcha_on_login').notNullable().defaultTo(false)
        table.boolean('captcha_on_register').notNullable().defaultTo(false)
        table.boolean('ga4_enabled').notNullable().defaultTo(false)
        table.string('ga4_measurement_id').nullable()
        table.boolean('clarity_enabled').notNullable().defaultTo(false)
        table.string('clarity_project_id').nullable()
        table.timestamp('updated_at').notNullable()
        table.timestamp('deleted_at').nullable()
      })
    }
  }

  async down() {
    this.schema.dropTable('integration_settings')
    this.schema.dropTable('web_settings')
  }
}
