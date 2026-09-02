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

  /**
   * The storefront account behind this affiliate. Affiliates are account-based:
   * a customer applies, an admin approves. Nullable only for historical rows.
   */
  @column()
  declare accountId: string | null

  /** Millipercent (10% → 10000). Integer, for the same reason discounts are. */
  @column()
  declare commissionPercentMilli: number

  /**
   * `pending` (applied, awaiting approval) → `active` (earning) with `paused`,
   * `blocked` and `rejected` as non-earning states. Only `active` earns.
   */
  @column()
  declare status: 'pending' | 'active' | 'paused' | 'blocked' | 'rejected'

  /**
   * Structured payout instrument (bank / e-wallet / PayPal), encrypted JSON.
   *
   * A payment instrument: the admin list must never be able to leak it, so it
   * is stored the same way gateway secrets are and never serialised.
   */
  @column({ serializeAs: null })
  declare payoutMethodEnc: string | null

  /** When the account applied to become an affiliate (orders the admin queue). */
  @column.dateTime()
  declare appliedAt: DateTime | null

  /** The applicant's own note — why they want in. Set on apply / re-apply. */
  @column()
  declare applicantMessage: string | null

  /** Admin-only note. */
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
