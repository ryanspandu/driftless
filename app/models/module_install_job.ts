import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * JSON column holding a list.
 *
 * The shared `jsonColumn` helper defaults an absent value to `{}`, which is the
 * right default for a settings blob and the wrong one here — the client would
 * receive an object where it expects an array and `.length` would silently be
 * `undefined`.
 */
const jsonArrayColumn = {
  prepare: (value: unknown) => JSON.stringify(value ?? []),
  consume: (value: unknown): string[] => {
    if (value === null || value === undefined) return []
    return typeof value === 'string' ? JSON.parse(value) : (value as string[])
  },
}

/**
 * States an install passes through.
 *
 * There is no `restarting`. `awaiting_restart` plus the restart watcher covers
 * it, and it means the transition *out* of `awaiting_restart` is **proof** the
 * restart happened and the module loaded — rather than an assumption written
 * down by a process that was about to die.
 */
export type ModuleInstallState =
  | 'queued'
  | 'running'
  | 'awaiting_restart'
  | 'succeeded'
  | 'failed'
  | 'abandoned'

export type ModuleInstallStep = 'migrate' | 'build' | 'enable' | 'restart'

/** States in which the job still owns the single active slot. */
export const ACTIVE_STATES: ModuleInstallState[] = ['queued', 'running', 'awaiting_restart']

/** The value written into `active_lock` while a job is active. */
export const ACTIVE_LOCK = '1'

export default class ModuleInstallJob extends BaseModel {
  static table = 'module_install_jobs'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare moduleName: string

  @column()
  declare state: ModuleInstallState

  @column()
  declare step: ModuleInstallStep | null

  /**
   * `'1'` while active, null once finished. The unique index on this column is
   * what makes "one install at a time" a database fact rather than a
   * convention — see the migration for why it is shaped this way.
   */
  @column()
  declare activeLock: string | null

  @column()
  declare requiresBuild: boolean

  @column()
  declare requiresRestart: boolean

  @column()
  declare pid: number | null

  @column.dateTime()
  declare heartbeatAt: DateTime | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare finishedAt: DateTime | null

  @column(jsonArrayColumn)
  declare appliedMigrations: string[]

  @column()
  declare releaseStamp: string | null

  @column()
  declare restartKind: string | null

  @column()
  declare errorReason: string | null

  @column()
  declare errorMessage: string | null

  @column()
  declare logTail: string | null

  @column()
  declare requestedByUserId: number | null

  @column()
  declare requestId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get isActive(): boolean {
    return ACTIVE_STATES.includes(this.state)
  }
}
