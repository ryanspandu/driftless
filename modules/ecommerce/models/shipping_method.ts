import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn, moneyColumn } from '#models/_columns'

/** A flat rate within one zone — "Standard", "Express". */
export default class ShippingMethod extends BaseModel {
  static table = 'ecommerce_shipping_methods'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare zoneId: string

  @column()
  declare name: string

  @column()
  declare description: string | null

  /** In the store's **base** currency. Others live in `ecommerce_shipping_rates`. */
  @column(moneyColumn)
  declare rateAmount: number

  /**
   * Subtotal at or above which this method is free. Null disables free
   * shipping — distinct from `0`, which would make everything free.
   */
  @column(moneyColumn)
  declare freeAboveAmount: number | null

  @column()
  declare minDeliveryDays: number | null

  @column()
  declare maxDeliveryDays: number | null

  @column(booleanColumn)
  declare enabled: boolean

  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null
}
