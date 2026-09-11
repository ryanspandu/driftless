import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import MenuItem from '#models/menu_item'

/**
 * A reusable, named navigation menu (WordPress-style). Its items form an
 * ordered, nested tree via `MenuItem.parentId` + `MenuItem.position`. A menu is
 * placed on the site by dropping a `MenuBar` block (bound to this `handle`) into
 * a HEADER/FOOTER template.
 */
export default class Menu extends BaseModel {
  static table = 'menus'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Stable, human-typable key a `MenuBar` block binds to (e.g. "primary"). */
  @column()
  declare handle: string

  @column()
  declare name: string

  @hasMany(() => MenuItem, { foreignKey: 'menuId' })
  declare items: HasMany<typeof MenuItem>

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
