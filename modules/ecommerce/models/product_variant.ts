import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { booleanColumn, jsonColumn, moneyColumn } from '#models/_columns'
import Product from '#modules/ecommerce/models/product'

export default class ProductVariant extends BaseModel {
  static table = 'ecommerce_product_variants'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productId: string

  @column()
  declare title: string

  @column()
  declare sku: string | null

  /** Minor units. The authoritative price — this is what a buyer is charged. */
  @column(moneyColumn)
  declare priceAmount: number

  /** "Was" price for a strikethrough. Display only. */
  @column(moneyColumn)
  declare compareAtAmount: number | null

  /**
   * Cost of goods, in minor units.
   *
   * Internal margin data. **Never serialise this into a storefront response** —
   * `tests/functional/` walks every public payload asserting it is absent.
   */
  @column(moneyColumn)
  declare costAmount: number | null

  @column()
  declare weightGrams: number | null

  /** Selected value per option axis, e.g. `{ Size: 'L', Colour: 'Blue' }`. */
  @column(jsonColumn)
  declare optionValues: Record<string, string>

  /** Physically in stock, including units currently reserved by open checkouts. */
  @column()
  declare stockOnHand: number

  /** Held by unpaid orders that have not yet expired. */
  @column()
  declare stockReserved: number

  @column(booleanColumn)
  declare trackInventory: boolean

  @column(booleanColumn)
  declare allowBackorder: boolean

  @column()
  declare imageUrl: string | null

  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => Product, { foreignKey: 'productId' })
  declare product: BelongsTo<typeof Product>

  /**
   * What a shopper can actually buy right now.
   *
   * Untracked or backorder-enabled variants are always available; otherwise it
   * is what is on the shelf minus what open checkouts are holding.
   */
  get availableStock(): number {
    if (!this.trackInventory || this.allowBackorder) return Number.POSITIVE_INFINITY
    return Math.max(this.stockOnHand - this.stockReserved, 0)
  }

  get inStock(): boolean {
    return this.availableStock > 0
  }
}
