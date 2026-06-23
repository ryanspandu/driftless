import { DateTime } from 'luxon'
import Task, { type TaskPriority, type TaskStatus } from '#modules/tasks/models/task'
import { newUlid } from '#services/ulid_service'

export interface TaskDto {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  assignedUserId: number | null
  createdAt: string
  updatedAt: string
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

export default class TasksService {
  async findAll(): Promise<TaskDto[]> {
    const rows = await Task.query().whereNull('deleted_at').orderBy('created_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async create(userId: number | null, dto: TaskInput & { title: string }): Promise<TaskDto> {
    const row = await Task.create({
      id: newUlid(),
      title: dto.title,
      description: dto.description ?? null,
      status: this.normalizeStatus(dto.status),
      priority: this.normalizePriority(dto.priority),
      dueDate: this.parseDate(dto.dueDate),
      assignedUserId: dto.assignedUserId ?? null,
      createdByUserId: userId,
    })
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
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await Task.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.deletedAt = DateTime.now()
    await row.save()
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
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate ? row.dueDate.toISODate() : null,
      assignedUserId: row.assignedUserId,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}
