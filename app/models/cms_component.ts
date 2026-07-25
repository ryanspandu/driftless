import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export interface CmsComponentField {
  key: string
  label: string
  type: string
}

export default class CmsComponent extends BaseModel {
  static table = 'cms_components'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare key: string

  @column()
  declare label: string

  @column()
  declare icon: string | null

  @column({
    prepare: (v) => JSON.stringify(v ?? []),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : (v ?? [])),
  })
  declare fields: CmsComponentField[]

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
