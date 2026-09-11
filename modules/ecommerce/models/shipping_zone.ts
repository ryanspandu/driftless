import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn, jsonColumn } from '#models/_columns'

/**
 * A set of destinations that share shipping rates.
 *
 * A zone with an empty `countries` array is the **catch-all** — matched only
 * when no country-specific zone applies, so a store can offer a default rate
 * everywhere without listing every country on earth.
 */
export default class ShippingZone extends BaseModel {
  static table = 'ecommerce_shipping_zones'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  /** ISO 3166-1 alpha-2 codes. Empty = catch-all. */
  @column(jsonColumn)
  declare countries: string[]

  /** Optional state/province narrowing within those countries. */
  @column(jsonColumn)
  declare states: string[]

  @column()
  declare position: number

  @column(booleanColumn)
  declare enabled: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null
}
