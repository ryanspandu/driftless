import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Append-only audit of every builder-API call made with an access token — the
 * per-tool activity the MCP admin page shows. One row per request; written
 * fire-and-forget by the audit middleware, so a failure here never affects the
 * request it records.
 */
export default class extends BaseSchema {
  protected tableName = 'mcp_audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id').primary()
      // The access token identifier + its name, captured at request time so the
      // log survives the token being revoked later.
      table.string('token_id').nullable().index()
      table.string('token_name').nullable()
      table.integer('user_id').nullable()
      table.string('method').notNullable()
      table.text('path').notNullable()
      // A friendly label derived from method+path, e.g. "page.publish".
      table.string('action').notNullable()
      table.integer('status').notNullable()
      table.integer('duration_ms').notNullable().defaultTo(0)
      table.string('ip').nullable()
      table.timestamp('created_at').notNullable().index()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
