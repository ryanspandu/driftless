import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { moneyColumn } from '#models/_columns'

/**
 * `pending` → `approved` → `paid`, with `void` for a reversed sale.
 *
 * The `approved` step exists so nothing is paid out on a sale that could still
 * be refunded — a store that pays commission immediately funds a refund cycle
 * as a way of extracting money.
 */
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'void'

export default class Commission extends BaseModel {
  static table = 'ecommerce_commissions'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare affiliateId: string

  /**
   * Unique at the database level: one commission per order, full stop. Without
   * it a replayed `order.paid` event pays the affiliate twice for one sale.
   */
  @column()
  declare orderId: string

  @column(moneyColumn)
  declare amount: number

  @column()
  declare currency: string

  @column(moneyColumn)
  declare orderSubtotalAmount: number

  @column()
  declare ratePercentMilli: number

  @column()
  declare status: CommissionStatus

  @column.dateTime()
  declare approvedAt: DateTime | null

  @column.dateTime()
  declare paidAt: DateTime | null

  @column()
  declare voidReason: string | null

  @column()
  declare paidByUserId: number | null

  /**
   * The withdrawal this commission is attached to, if any. An `approved`
   * commission with no `withdrawalId` is *available* to withdraw; once attached
   * it is reserved, and becomes `paid` when the withdrawal is paid out.
   */
  @column()
  declare withdrawalId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
