import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * SMTP credentials configured from the admin UI.
 *
 * A single row, keyed `default`, mirroring `integration_settings`. It is a
 * dedicated table rather than a `web_settings` section because `web_settings`
 * stores plaintext `text` values and this holds a password.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('mail_settings', (table) => {
      table.string('id').primary() // always 'default'

      table.boolean('enabled').notNullable().defaultTo(false)

      table.string('host').nullable()
      table.integer('port').nullable()
      // Implicit TLS on connect (port 465). STARTTLS on 587 is negotiated by
      // nodemailer regardless, so this is not "use TLS at all".
      table.boolean('secure').notNullable().defaultTo(false)

      table.string('username').nullable()
      // AES-256-GCM via `config/encryption.ts`. The `_enc` suffix marks
      // ciphertext columns throughout this codebase.
      table.text('password_enc').nullable()

      table.string('from_address').nullable()
      table.string('from_name').nullable()

      // Result of the last "send test email" attempt, so the admin screen can
      // show whether the configuration has ever actually worked.
      table.timestamp('last_tested_at').nullable()
      table.boolean('last_test_ok').nullable()
      table.string('last_test_error', 512).nullable()

      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable('mail_settings')
  }
}
