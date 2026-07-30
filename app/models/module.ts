import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Module extends BaseModel {
  static table = 'modules'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  /** Unique module key (= folder name under `modules/`). */
  @column()
  declare name: string

  @column()
  declare enabled: boolean

  @column()
  declare version: string | null

  /**
   * Trust tier, mirrored from the manifest by `ModulesService.reconcile()`.
   *
   * Stored as well as declared so the admin can group and filter installed
   * packages without importing every manifest, and so a package whose folder
   * has gone missing still reports what it was.
   */
  @column()
  declare kind: 'app' | 'plugin'

  /** Set when a module's `boot()` threw and it was disabled automatically. */
  @column()
  declare bootError: string | null

  /** Where the folder came from: shipped with the CMS, or installed later. */
  @column()
  declare source: 'bundled' | 'marketplace' | 'sideload'

  @column.dateTime()
  declare installedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
