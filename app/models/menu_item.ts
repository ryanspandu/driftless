import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Menu from '#models/menu'

/** What a menu item points at. */
export type MenuItemType = 'page' | 'url' | 'collection'
/** Whether the item is a plain link or opens a popup panel. */
export type MenuItemOpenMode = 'link' | 'mega'

/**
 * One node in a menu's tree. `parentId` nests it under another item;
 * `position` orders it among its siblings. A `type` of `page`/`collection`
 * stores a loose reference (`pageId` / `collectionKey`+`recordId`) resolved to a
 * URL at render time; `url` holds a custom href verbatim.
 */
export default class MenuItem extends BaseModel {
  static table = 'menu_items'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare menuId: string

  @column()
  declare parentId: string | null

  @column()
  declare position: number

  @column()
  declare label: string

  @column()
  declare type: MenuItemType

  @column()
  declare pageId: string | null

  @column()
  declare url: string | null

  @column()
  declare collectionKey: string | null

  @column()
  declare recordId: string | null

  @column()
  declare target: '_self' | '_blank'

  @column()
  declare openMode: MenuItemOpenMode

  @belongsTo(() => Menu, { foreignKey: 'menuId' })
  declare menu: BelongsTo<typeof Menu>

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
