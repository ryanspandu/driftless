import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { booleanColumn } from '#models/_columns'

/**
 * A saved address in a customer's address book.
 *
 * The table (`ecommerce_addresses`) has existed since the customers migration
 * but had no model until the account portal needed one. An order still copies a
 * **snapshot** of its address at checkout ([order.ts](#modules/ecommerce/models/order)),
 * so editing or deleting a saved address never rewrites a past order — these
 * rows are a convenience for the customer, not the source of truth for an order.
 */
export default class CustomerAddress extends BaseModel {
  static table = 'ecommerce_addresses'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Null for a guest-captured address; a saved address always has an owner. */
  @column()
  declare customerId: string | null

  @column()
  declare label: string | null

  @column()
  declare firstName: string | null

  @column()
  declare lastName: string | null

  @column()
  declare company: string | null

  // The table columns are `line1`/`line2`; the default naming strategy would
  // otherwise map these to `line_1`/`line_2`.
  @column({ columnName: 'line1' })
  declare line1: string

  @column({ columnName: 'line2' })
  declare line2: string | null

  @column()
  declare city: string

  @column()
  declare state: string | null

  @column()
  declare postalCode: string | null

  /** ISO 3166-1 alpha-2. */
  @column()
  declare country: string

  @column()
  declare phone: string | null

  @column(booleanColumn)
  declare isDefaultShipping: boolean

  @column(booleanColumn)
  declare isDefaultBilling: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null
}
