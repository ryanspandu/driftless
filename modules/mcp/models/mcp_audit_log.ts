import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * One builder-API request made with an access token. Append-only: written by
 * the audit middleware and only ever read by the MCP admin activity view.
 */
export default class McpAuditLog extends BaseModel {
  static table = 'mcp_audit_logs'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare tokenId: string | null

  @column()
  declare tokenName: string | null

  @column()
  declare userId: number | null

  @column()
  declare method: string

  @column()
  declare path: string

  @column()
  declare action: string

  @column()
  declare status: number

  @column()
  declare durationMs: number

  @column()
  declare ip: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
