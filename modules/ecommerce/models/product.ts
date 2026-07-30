import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import { booleanColumn, jsonColumn, moneyColumn } from '#models/_columns'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import ProductImage from '#modules/ecommerce/models/product_image'
import Category from '#modules/ecommerce/models/category'

export type ProductType = 'physical' | 'digital'
export type ProductStatus = 'draft' | 'active' | 'archived'

/** One option axis, e.g. `{ name: 'Size', values: ['S', 'M', 'L'] }`. */
export interface ProductOption {
  name: string
  values: string[]
}

/**
 * What the buy button does. `external` means the shop does not sell this — the
 * button links to whoever does, which is how an affiliate listing works.
 */
export type ProductCtaMode = 'add_to_cart' | 'buy_now' | 'external'

export default class Product extends BaseModel {
  static table = 'ecommerce_products'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare slug: string

  @column()
  declare title: string

  @column()
  declare subtitle: string | null

  /** TipTap JSON, matching how the CMS stores rich text. */
  @column(jsonColumn)
  declare description: Record<string, unknown>

  @column()
  declare type: ProductType

  @column()
  declare status: ProductStatus

  /**
   * Cheapest variant price, denormalised so listings can sort and filter without
   * joining. The authoritative price always lives on the variant — this is a
   * cache and must never be used to charge anyone.
   */
  @column(moneyColumn)
  declare priceFromAmount: number | null

  @column()
  declare currency: string

  @column(jsonColumn)
  declare seo: Record<string, unknown>

  @column(jsonColumn)
  declare options: ProductOption[]

  @column(booleanColumn)
  declare featured: boolean

  @column()
  declare ctaMode: ProductCtaMode

  /** Where an `external` product sends the visitor. Always `http(s)`. */
  @column()
  declare externalUrl: string | null

  @column()
  declare externalLabel: string | null

  /**
   * True when this listing cannot be bought here.
   *
   * The single question the cart, pricing and checkout all ask. Reading the
   * mode directly at each call site would mean three places to forget.
   */
  get isExternal(): boolean {
    return this.ctaMode === 'external'
  }

  @column()
  declare position: number

  @column()
  declare createdByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @hasMany(() => ProductVariant, { foreignKey: 'productId' })
  declare variants: HasMany<typeof ProductVariant>

  @hasMany(() => ProductImage, { foreignKey: 'productId' })
  declare images: HasMany<typeof ProductImage>

  @manyToMany(() => Category, {
    pivotTable: 'ecommerce_product_categories',
    localKey: 'id',
    pivotForeignKey: 'product_id',
    relatedKey: 'id',
    pivotRelatedForeignKey: 'category_id',
  })
  declare categories: ManyToMany<typeof Category>
}
