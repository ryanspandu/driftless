import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { moneyColumn } from '#models/_columns'

export default class Affiliate extends BaseModel {
  static table = 'ecommerce_affiliates'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** The referral code, unique. Appears in links as `/a/:code`. */
  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare email: string

  @column()
  declare customerId: string | null

  /** Millipercent (10% → 10000). Integer, for the same reason discounts are. */
  @column()
  declare commissionPercentMilli: number

  @column()
  declare status: 'active' | 'paused' | 'blocked'

  /**
   * Bank or PayPal details for a manual payout, encrypted.
   *
   * A payment instrument: the admin list must never be able to leak it, so it
   * is stored the same way gateway secrets are and never serialised.
   */
  @column({ serializeAs: null })
  declare payoutDetailsEnc: string | null

  @column()
  declare notes: string | null

  @column()
  declare clicksCount: number

  @column()
  declare ordersCount: number

  @column(moneyColumn)
  declare totalCommissionAmount: number

  @column(moneyColumn)
  declare paidCommissionAmount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  get commissionPercent(): number {
    return this.commissionPercentMilli / 1_000
  }

  /** May this affiliate earn on new orders? */
  get isEarning(): boolean {
    return this.status === 'active' && !this.deletedAt
  }

  /** Commission earned but not yet paid out. */
  get outstandingAmount(): number {
    return Math.max(this.totalCommissionAmount - this.paidCommissionAmount, 0)
  }
}
