import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { moneyColumn } from '#models/_columns'

/**
 * What a variant costs in one non-base currency.
 *
 * A listed price, never a converted one — see the migration for why this module
 * has no exchange rates anywhere in it.
 */
export default class VariantPrice extends BaseModel {
  static table = 'ecommerce_variant_prices'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare variantId: string

  @column()
  declare currency: string

  @column(moneyColumn)
  declare priceAmount: number

  @column(moneyColumn)
  declare compareAtAmount: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
