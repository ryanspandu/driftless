import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * JSON column holding a list (log tail / selected sections). The shared
 * `jsonColumn` helper defaults to `{}`, wrong for an array — the client expects
 * `.length`. Mirrors `module_install_job.ts`.
 */
const jsonArrayColumn = {
  prepare: (value: unknown) => JSON.stringify(value ?? []),
  consume: (value: unknown): string[] => {
    if (value === null || value === undefined) return []
    return typeof value === 'string' ? JSON.parse(value) : (value as string[])
  },
}

/** JSON column holding an arbitrary object (the ImportResult / export meta), or null. */
const jsonObjectColumn = {
  prepare: (value: unknown) =>
    value === null || value === undefined ? null : JSON.stringify(value),
  consume: (value: unknown): Record<string, unknown> | null => {
    if (value === null || value === undefined) return null
    return typeof value === 'string' ? JSON.parse(value) : (value as Record<string, unknown>)
  },
}

export type DataTransferKind = 'import' | 'export'
export type DataTransferState = 'queued' | 'running' | 'succeeded' | 'failed'

/** States in which the job still owns its single active slot (per kind). */
export const ACTIVE_STATES: DataTransferState[] = ['queued', 'running']

export default class DataTransferJob extends BaseModel {
  static table = 'data_transfer_jobs'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare kind: DataTransferKind

  @column()
  declare state: DataTransferState

  /** The kind while active, null once terminal (backs the unique single-flight index). */
  @column()
  declare activeLock: string | null

  @column()
  declare total: number

  @column()
  declare completed: number

  @column()
  declare currentSection: string | null

  @column(jsonArrayColumn)
  declare logTail: string[]

  @column()
  declare errorMessage: string | null

  @column(jsonObjectColumn)
  declare result: Record<string, unknown> | null

  @column()
  declare archivePath: string | null

  @column()
  declare downloadPath: string | null

  @column()
  declare mode: string | null

  @column()
  declare conflict: string | null

  @column(jsonArrayColumn)
  declare only: string[]

  @column()
  declare dryRun: boolean

  @column()
  declare authorId: number | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare finishedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get isActive(): boolean {
    return ACTIVE_STATES.includes(this.state)
  }
}
