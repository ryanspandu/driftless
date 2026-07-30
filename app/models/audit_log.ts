import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { jsonColumn } from '#models/_columns'

export type AuditActorType = 'user' | 'customer' | 'worker' | 'system'

/**
 * One entry in the append-only audit trail. Rows are never updated or deleted;
 * there is intentionally no `updatedAt` or `deletedAt`.
 */
export default class AuditLog extends BaseModel {
  static table = 'audit_logs'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare actorType: AuditActorType

  /** `users.id` (integer, stringified) or a customer ULID. Null for system actions. */
  @column()
  declare actorId: string | null

  /** The actor's email or name as it was at the time, so the row stays readable
   *  after the account is renamed or deleted. */
  @column()
  declare actorLabel: string | null

  /** Dotted verb, e.g. `order.refunded`. */
  @column()
  declare action: string

  @column()
  declare subjectType: string | null

  @column()
  declare subjectId: string | null

  /** Already filtered by `AuditLogService` — never contains secrets. */
  @column(jsonColumn)
  declare changes: Record<string, unknown>

  /** Minor units, denormalised out of `changes` for reporting. */
  @column()
  declare amount: number | null

  @column()
  declare currency: string | null

  @column()
  declare ipHash: string | null

  @column()
  declare userAgent: string | null

  @column()
  declare requestId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
