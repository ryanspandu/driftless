import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn } from '#models/_columns'

/**
 * A currency the storefront may be switched to.
 *
 * The store's base currency lives in `ecommerce_settings.currency` and is always
 * available whether or not it has a row here, so an empty table means a
 * single-currency store.
 */
export default class StoreCurrency extends BaseModel {
  static table = 'ecommerce_currencies'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** ISO 4217, uppercase. */
  @column()
  declare code: string

  @column(booleanColumn)
  declare enabled: boolean

  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
