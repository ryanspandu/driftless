import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn, jsonColumn, moneyColumn } from '#models/_columns'

export type DiscountType = 'percent' | 'fixed' | 'free_shipping'

/** Which products a discount applies to. Empty means the whole catalogue. */
export interface DiscountScope {
  productIds?: string[]
  categoryIds?: string[]
}

export default class Discount extends BaseModel {
  static table = 'ecommerce_discounts'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Stored upper-cased; lookups normalise case in the service. */
  @column()
  declare code: string

  @column()
  declare name: string | null

  @column()
  declare description: string | null

  @column()
  declare type: DiscountType

  /**
   * Millipercent for `percent` (10.5% → 10500), minor units for `fixed`.
   *
   * Integer either way. A float discount rate produces totals that differ by a
   * cent depending on evaluation order, which is exactly the class of bug this
   * module is built to avoid.
   */
  @column()
  declare value: number

  @column(moneyColumn)
  declare minSubtotalAmount: number | null

  /** Ceiling on a percentage discount, in minor units. */
  @column(moneyColumn)
  declare maxDiscountAmount: number | null

  @column.dateTime()
  declare startsAt: DateTime | null

  @column.dateTime()
  declare endsAt: DateTime | null

  @column()
  declare usageLimit: number | null

  @column()
  declare usageLimitPerCustomer: number | null

  /**
   * Incremented by a conditional UPDATE that also checks the limit, so the
   * check and the claim are one atomic statement — never read-then-write.
   */
  @column()
  declare usageCount: number

  @column(jsonColumn)
  declare appliesTo: DiscountScope

  @column(booleanColumn)
  declare enabled: boolean

  @column()
  declare createdByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  /** The rate as a percentage, for `Money.applyPercent`. */
  get percent(): number {
    return this.value / 1_000
  }

  /** Is this code live right now, ignoring per-order conditions? */
  isLiveAt(now: DateTime = DateTime.now()): boolean {
    if (!this.enabled || this.deletedAt) return false
    if (this.startsAt && this.startsAt > now) return false
    if (this.endsAt && this.endsAt < now) return false
    if (this.usageLimit !== null && this.usageCount >= this.usageLimit) return false
    return true
  }
}
