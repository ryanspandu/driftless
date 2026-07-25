import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export default class Task extends BaseModel {
  static table = 'tasks'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare status: TaskStatus

  @column()
  declare priority: TaskPriority

  @column.date()
  declare dueDate: DateTime | null

  @column()
  declare position: number

  @column()
  declare assignedUserId: number | null

  @belongsTo(() => User, { foreignKey: 'assignedUserId' })
  declare assignedUser: BelongsTo<typeof User>

  @column()
  declare createdByUserId: number | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
