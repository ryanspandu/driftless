import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn } from '#models/_columns'

/** Single-row store configuration. Always id `default`. */
export default class EcommerceSetting extends BaseModel {
  static table = 'ecommerce_settings'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare storeName: string | null

  @column()
  declare storeEmail: string | null

  @column()
  declare supportEmail: string | null

  @column()
  declare addressLine1: string | null

  @column()
  declare addressLine2: string | null

  @column()
  declare city: string | null

  @column()
  declare state: string | null

  @column()
  declare postalCode: string | null

  /** ISO 3166-1 alpha-2. */
  @column()
  declare country: string | null

  /** ISO 4217. Every order also records its own, so this is only the default. */
  @column()
  declare currency: string

  @column()
  declare locale: string

  /**
   * Tax rate as millionths of a percent (8.25% -> 8_250_000 / 100_000 = 82500).
   * Stored as an integer so the rate itself never introduces float error.
   * Divide by 10_000 to get a percentage.
   */
  @column()
  declare taxRateMicro: number

  @column(booleanColumn)
  declare taxInclusive: boolean

  @column()
  declare taxLabel: string

  /** How long an unpaid order holds its stock reservation. */
  @column()
  declare checkoutTtlMinutes: number

  /** How long after payment a refund is still expected. */
  @column()
  declare refundWindowDays: number

  /** Last-click attribution window for affiliate referrals. */
  @column()
  declare affiliateCookieDays: number

  @column()
  declare orderNumberPrefix: string

  /** Builder page used as the product-detail template. Null = no product pages. */
  @column()
  declare productPageId: string | null

  /** Builder page served at `/shop`. Null = no shop front. */
  @column()
  declare shopPageId: string | null

  /**
   * Optional builder-page overrides for the storefront application screens. Null
   * (the default) serves the built-in fixed screen; a published page id makes
   * that page render at the screen's URL instead.
   */
  @column()
  declare cartPageId: string | null

  @column()
  declare checkoutPageId: string | null

  @column()
  declare orderPageId: string | null

  @column()
  declare accountPageId: string | null

  @column()
  declare loginPageId: string | null

  @column()
  declare registerPageId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /** The tax rate as a percentage, for `Money.applyPercent`. */
  get taxRatePercent(): number {
    return this.taxRateMicro / 10_000
  }
}
