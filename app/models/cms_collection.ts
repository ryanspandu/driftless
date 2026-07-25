import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CmsField from '#models/cms_field'

export default class CmsCollection extends BaseModel {
  static table = 'cms_collections'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare key: string

  @column()
  declare label: string

  @column()
  declare icon: string | null

  @column()
  declare group: string | null

  @column()
  declare source: 'PRISMA' | 'DYNAMIC'

  @column()
  declare modelName: string | null

  @column()
  declare tableName: string | null

  @column({
    prepare: (v) => JSON.stringify(v),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  })
  declare listConfig: Record<string, unknown>

  @column()
  declare revisionsOn: boolean

  @column()
  declare draftsOn: boolean

  @column()
  declare kind: 'collection' | 'single'

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => CmsField, { foreignKey: 'collectionId' })
  declare fields: HasMany<typeof CmsField>
}
