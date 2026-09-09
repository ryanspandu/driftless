import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * A product tag — a flat taxonomy for storefront products (unlike Category,
 * which is hierarchical). Assigned to products via the `ecommerce_product_tags`
 * pivot; public archive at `/shop/tag/:slug`.
 */
export default class Tag extends BaseModel {
  static table = 'ecommerce_tags'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare slug: string

  @column()
  declare name: string

  @column()
  declare description: string | null

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
}
