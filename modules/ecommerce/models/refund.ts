import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { jsonColumn, moneyColumn } from '#models/_columns'

export default class Refund extends BaseModel {
  static table = 'ecommerce_refunds'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  @column()
  declare paymentId: string | null

  @column(moneyColumn)
  declare amount: number

  @column()
  declare currency: string

  @column()
  declare reason: string | null

  @column()
  declare status: 'pending' | 'succeeded' | 'failed'

  /** Unique: a replayed refund webhook must not credit the customer twice. */
  @column()
  declare gatewayRefundId: string | null

  @column(jsonColumn)
  declare gatewayPayload: Record<string, unknown>

  @column()
  declare createdByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
