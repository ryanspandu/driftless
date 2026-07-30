import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { moneyColumn } from '#models/_columns'

/**
 * A line on an order — a **snapshot**, not a reference.
 *
 * Title, SKU and unit price are copied at checkout. Renaming a product or
 * changing its price must not retroactively alter what a customer was charged,
 * and deleting a product must not make an old order unreadable.
 */
export default class OrderItem extends BaseModel {
  static table = 'ecommerce_order_items'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare orderId: string

  /** Kept for restocking and reporting; nulled rather than cascaded on delete. */
  @column()
  declare variantId: string | null

  @column()
  declare productId: string | null

  @column()
  declare title: string

  @column()
  declare variantTitle: string | null

  @column()
  declare sku: string | null

  @column()
  declare imageUrl: string | null

  @column()
  declare productType: 'physical' | 'digital'

  @column()
  declare quantity: number

  @column(moneyColumn)
  declare unitAmount: number

  @column(moneyColumn)
  declare subtotalAmount: number

  /** Order-level discount allocated to this line, so parts sum to the whole. */
  @column(moneyColumn)
  declare discountAmount: number

  @column(moneyColumn)
  declare taxAmount: number

  @column(moneyColumn)
  declare totalAmount: number

  @column()
  declare refundedQuantity: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
