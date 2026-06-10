import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CmsCollection from '#models/cms_collection'

export default class CmsField extends BaseModel {
  static table = 'cms_fields'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare collectionId: string

  @column()
  declare key: string

  @column()
  declare label: string

  @column()
  declare type: string

  @column()
  declare required: boolean

  @column()
  declare unique: boolean

  @column()
  declare order: number

  @column({
    prepare: (v) => JSON.stringify(v),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  })
  declare config: Record<string, unknown>

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => CmsCollection, { foreignKey: 'collectionId' })
  declare collection: BelongsTo<typeof CmsCollection>
}
