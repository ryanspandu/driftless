import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * A line in a cart: what, and how many.
 *
 * There is deliberately **no price column**. A cart records intent; every
 * amount is recomputed from the variant at checkout time. That is what makes
 * "the client never sends a price" a structural property rather than a
 * convention — there is no stored figure for a tampered request to influence.
 */
export default class CartItem extends BaseModel {
  static table = 'ecommerce_cart_items'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare cartId: string

  @column()
  declare variantId: string

  @column()
  declare quantity: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
