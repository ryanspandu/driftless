import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CartItem from '#modules/ecommerce/models/cart_item'

export default class Cart extends BaseModel {
  static table = 'ecommerce_carts'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /**
   * Hash of the cart token. The plaintext lives in a signed httpOnly cookie.
   * Storing the raw token would let database read access take over any live
   * cart.
   */
  @column({ serializeAs: null })
  declare tokenHash: string

  @column()
  declare accountId: string | null

  @column()
  declare currency: string

  @column()
  declare email: string | null

  @column()
  declare affiliateCode: string | null

  @column()
  declare discountCode: string | null

  @column.dateTime()
  declare expiresAt: DateTime

  /** Set when a basket reminder went out, so it is only ever sent once. */
  @column.dateTime()
  declare remindedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => CartItem, { foreignKey: 'cartId' })
  declare items: HasMany<typeof CartItem>
}
