import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Task, { type TaskPriority, type TaskStatus } from '#modules/tasks/models/task'
import User from '#models/user'
import { newUlid } from '#services/ulid_service'

export interface TaskAssignee {
  id: number
  displayName: string
  initials: string
}

export interface TaskDto {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  position: number
  assignedUserId: number | null
  assignee: TaskAssignee | null
  createdAt: string
  updatedAt: string
}

export interface TaskMoveResult {
  task: TaskDto
  status: TaskStatus
  orderedIds: string[]
}

interface TaskInput {
  title?: string
  description?: string | null
  status?: string
  priority?: string
  dueDate?: string | null
  assignedUserId?: number | null
}

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']
const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH']
const GAP = 1000

export default class TasksService {
  /** One query feeds both the kanban board and the list view. */
  async findAll(): Promise<TaskDto[]> {
    const rows = await Task.query()
      .whereNull('deleted_at')
      .preload('assignedUser')
      .orderBy('status')
      .orderBy('position')
      .orderBy('created_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async create(userId: number | null, dto: TaskInput & { title: string }): Promise<TaskDto> {
    const status = this.normalizeStatus(dto.status)
    const position = (await this.maxPosition(status)) + GAP
    const row = await Task.create({
      id: newUlid(),
      title: dto.title,
      description: dto.description ?? null,
      status,
      priority: this.normalizePriority(dto.priority),
      dueDate: this.parseDate(dto.dueDate),
      position,
      assignedUserId: dto.assignedUserId ?? null,
      createdByUserId: userId,
    })
    await row.load('assignedUser')
    return this.toDto(row)
  }

  async update(id: string, dto: TaskInput): Promise<TaskDto> {
    const row = await Task.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (dto.title !== undefined) row.title = dto.title
    if (dto.description !== undefined) row.description = dto.description
    if (dto.status !== undefined) row.status = this.normalizeStatus(dto.status)
    if (dto.priority !== undefined) row.priority = this.normalizePriority(dto.priority)
    if (dto.dueDate !== undefined) row.dueDate = this.parseDate(dto.dueDate)
    if (dto.assignedUserId !== undefined) row.assignedUserId = dto.assignedUserId
    await row.save()
    await row.load('assignedUser')
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await Task.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.deletedAt = DateTime.now()
    await row.save()
  }

  /**
   * Move a card to `toStatus`, slotted between the neighbours `beforeId` (the
   * card directly above the drop) and `afterId` (directly below). Ordering is
   * `position` ASC; the new position is the midpoint of the neighbours (or
   * top/bottom/empty sentinels). When the float gap underflows, the target
   * column is renumbered to clean multiples — all inside one transaction.
   */
  async move(
    id: string,
    opts: { toStatus: string; beforeId?: string | null; afterId?: string | null }
  ): Promise<TaskMoveResult> {
    const status = this.normalizeStatus(opts.toStatus)
    return db.transaction(async (trx) => {
      const task = await Task.query({ client: trx })
        .where('id', id)
        .whereNull('deleted_at')
        .firstOrFail()

      const before = opts.beforeId
        ? await Task.query({ client: trx })
            .where('id', opts.beforeId)
            .where('status', status)
            .whereNull('deleted_at')
            .first()
        : null
      const after = opts.afterId
        ? await Task.query({ client: trx })
            .where('id', opts.afterId)
            .where('status', status)
            .whereNull('deleted_at')
            .first()
        : null

      const beforePos = before?.position ?? null
      const afterPos = after?.position ?? null
      const tooTight = beforePos !== null && afterPos !== null && afterPos - beforePos < 2e-6

      if (tooTight) {
        // Renumber the whole target column with the moved card slotted in.
        const others = await Task.query({ client: trx })
          .where('status', status)
          .whereNull('deleted_at')
          .whereNot('id', id)
          .orderBy('position')
          .orderBy('created_at', 'desc')
        let insertIdx = others.length
        if (after) {
          const ai = others.findIndex((t) => t.id === after.id)
          if (ai >= 0) insertIdx = ai
        } else if (before) {
          const bi = others.findIndex((t) => t.id === before.id)
          if (bi >= 0) insertIdx = bi + 1
        } else {
          insertIdx = 0
        }
        const ordered = [...others.slice(0, insertIdx), task, ...others.slice(insertIdx)]
        for (let i = 0; i < ordered.length; i++) {
          ordered[i]!.position = (i + 1) * GAP
          ordered[i]!.status = status
          ordered[i]!.useTransaction(trx)
          await ordered[i]!.save()
        }
      } else {
        let newPos: number
        if (beforePos !== null && afterPos !== null) newPos = (beforePos + afterPos) / 2
        else if (beforePos !== null) newPos = beforePos + GAP
        else if (afterPos !== null) newPos = afterPos - GAP
        else newPos = GAP
        task.status = status
        task.position = newPos
        task.useTransaction(trx)
        await task.save()
      }

      await task.load('assignedUser')
      const orderedRows = await Task.query({ client: trx })
        .where('status', status)
        .whereNull('deleted_at')
        .orderBy('position')
        .orderBy('created_at', 'desc')
        .select('id')
      return { task: this.toDto(task), status, orderedIds: orderedRows.map((r) => r.id) }
    })
  }

  /** Active users for the assignee picker (numeric ids matching the FK). */
  async listAssignees(): Promise<TaskAssignee[]> {
    const users = await User.query().where('status', 'ACTIVE')
    return users
      .map((u) => ({ id: u.id, displayName: u.displayName, initials: u.initials }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  private async maxPosition(status: TaskStatus): Promise<number> {
    const rows = await Task.query()
      .where('status', status)
      .whereNull('deleted_at')
      .max('position as max_position')
    const max = (rows[0] as unknown as { $extras?: { max_position?: unknown } })?.$extras
      ?.max_position
    return max != null ? Number(max) : 0
  }

  private parseDate(value: string | null | undefined): DateTime | null {
    if (!value) return null
    const d = DateTime.fromISO(value)
    return d.isValid ? d : null
  }

  private normalizeStatus(value?: string): TaskStatus {
    return STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : 'TODO'
  }

  private normalizePriority(value?: string): TaskPriority {
    return PRIORITIES.includes(value as TaskPriority) ? (value as TaskPriority) : 'MEDIUM'
  }

  private toDto(row: Task): TaskDto {
    const u = row.assignedUser ?? null
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate ? row.dueDate.toISODate() : null,
      position: row.position,
      assignedUserId: row.assignedUserId,
      assignee: u ? { id: u.id, displayName: u.displayName, initials: u.initials } : null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}
