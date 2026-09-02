import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { moneyColumn } from '#models/_columns'

/**
 * A payout request from an affiliate.
 *
 * `requested` → `paid` | `rejected`. Payout itself is manual/out-of-band (the
 * admin marks it paid once the transfer is done) — no money-movement
 * credentials or KYC live here, matching the store's existing payout model.
 *
 * The commissions bundled into a withdrawal are linked via
 * `ecommerce_commissions.withdrawal_id`; the amount is their sum at request time.
 */
export default class AffiliateWithdrawal extends BaseModel {
  static table = 'ecommerce_affiliate_withdrawals'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare affiliateId: string

  @column(moneyColumn)
  declare amount: number

  @column()
  declare currency: string

  @column()
  declare status: 'requested' | 'paid' | 'rejected'

  /** The payout instrument as it was when requested, encrypted, never serialised. */
  @column({ serializeAs: null })
  declare payoutMethodSnapshotEnc: string | null

  @column.dateTime()
  declare requestedAt: DateTime

  @column.dateTime()
  declare processedAt: DateTime | null

  @column()
  declare processedByUserId: number | null

  @column()
  declare rejectionReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
