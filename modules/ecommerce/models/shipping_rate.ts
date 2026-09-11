import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { moneyColumn } from '#models/_columns'

/** A shipping method's rate in one non-base currency. Listed, never converted. */
export default class ShippingRate extends BaseModel {
  static table = 'ecommerce_shipping_rates'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare methodId: string

  @column()
  declare currency: string

  @column(moneyColumn)
  declare rateAmount: number

  @column(moneyColumn)
  declare freeAboveAmount: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
