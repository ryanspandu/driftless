import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { jsonColumn } from '#models/_columns'

/**
 * Append-only order history. Never updated, never deleted.
 *
 * Separate from `audit_logs`: that is the system-wide trail an administrator
 * reads, this is the timeline shown on the order itself and handed to a
 * customer-support person. Different audience, different retention.
 */
export default class OrderEvent extends BaseModel {
  static table = 'ecommerce_order_events'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  @column()
  declare type: string

  @column()
  declare fromStatus: string | null

  @column()
  declare toStatus: string | null

  @column()
  declare message: string | null

  @column(jsonColumn)
  declare meta: Record<string, unknown>

  @column()
  declare actorType: 'user' | 'customer' | 'worker' | 'system'

  @column()
  declare actorId: string | null

  @column()
  declare actorLabel: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
