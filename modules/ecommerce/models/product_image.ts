import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class ProductImage extends BaseModel {
  static table = 'ecommerce_product_images'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare productId: string

  /**
   * Media is referenced by URL rather than by `media.id` — the convention
   * everywhere else in this codebase, which keeps the existing media picker
   * components usable unchanged.
   */
  @column()
  declare mediaUrl: string

  @column()
  declare alt: string | null

  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
