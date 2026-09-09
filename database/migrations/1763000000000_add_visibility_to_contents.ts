import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'contents'

  async up() {
    const hasVisibility = await this.schema.hasColumn(this.tableName, 'visibility')
    const hasPassword = await this.schema.hasColumn(this.tableName, 'password_enc')

    this.schema.alterTable(this.tableName, (table) => {
      // Who may read the post: PUBLIC (anyone), PROTECTED (password-gated) or
      // MEMBER (any logged-in visitor). A native column, not a custom field.
      if (!hasVisibility) table.string('visibility', 20).notNullable().defaultTo('PUBLIC')
      // The Protected password, stored as an AES-256-GCM envelope (reversible, so
      // it stays recoverable in admin). TEXT: the envelope is longer than a hash.
      if (!hasPassword) table.text('password_enc').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('visibility')
      table.dropColumn('password_enc')
    })
  }
}
