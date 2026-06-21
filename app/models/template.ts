import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type TemplateType = 'HEADER' | 'FOOTER' | 'COMPONENT' | 'LAYOUT'

const jsonColumn = {
  prepare: (v: unknown) => JSON.stringify(v ?? {}),
  consume: (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : (v ?? {})),
}

export default class Template extends BaseModel {
  static table = 'templates'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare type: TemplateType

  /** Puck block tree. */
  @column(jsonColumn)
  declare content: Record<string, unknown>

  /** The site-wide default for its type (HEADER / FOOTER / LAYOUT). */
  @column()
  declare isDefault: boolean

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
