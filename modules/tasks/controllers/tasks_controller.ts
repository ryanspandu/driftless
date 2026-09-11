import type { HttpContext } from '@adonisjs/core/http'
import TasksService from '#modules/tasks/services/tasks_service'
import { renderPage } from '#helpers/inertia_render'

const service = new TasksService()

const FIELDS = ['title', 'description', 'status', 'priority', 'dueDate', 'assignedUserId']

/** Coerce a submitted assignee id to `number | null` ('' / null / NaN → null). */
function toUserId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default class TasksController {
  /** Admin page (FE: modules/tasks/ui/admin). */
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/tasks/admin/index', {})
  }

  async index({ response }: HttpContext) {
    return response.json(await service.findAll())
  }

  /** Active users for the assignee picker (tasks-scoped, numeric ids). */
  async assignees({ response }: HttpContext) {
    return response.json(await service.listAssignees())
  }

  async store({ request, auth, response }: HttpContext) {
    const body = request.only(FIELDS)
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      return response.status(422).json({ message: 'Title is required.' })
    }
    const row = await service.create(auth.user?.id ?? null, {
      title,
      description: typeof body.description === 'string' ? body.description : null,
      status: typeof body.status === 'string' ? body.status : undefined,
      priority: typeof body.priority === 'string' ? body.priority : undefined,
      dueDate: typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null,
      assignedUserId: toUserId(body.assignedUserId),
    })
    return response.status(201).json(row)
  }

  async update({ params, request, response }: HttpContext) {
    const body = request.only(FIELDS)
    try {
      const row = await service.update(params.id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
        priority: typeof body.priority === 'string' ? body.priority : undefined,
        dueDate:
          body.dueDate === undefined ? undefined : body.dueDate ? String(body.dueDate) : null,
        assignedUserId: body.assignedUserId === undefined ? undefined : toUserId(body.assignedUserId),
      })
      return response.json(row)
    } catch {
      return response.status(404).json({ message: 'Task not found.' })
    }
  }

  /** Drag-and-drop: reorder within a column and/or move across columns. */
  async move({ params, request, response }: HttpContext) {
    const { toStatus, beforeId, afterId } = request.only(['toStatus', 'beforeId', 'afterId'])
    try {
      const result = await service.move(params.id, {
        toStatus: typeof toStatus === 'string' ? toStatus : 'TODO',
        beforeId: beforeId ? String(beforeId) : null,
        afterId: afterId ? String(afterId) : null,
      })
      return response.json(result)
    } catch {
      return response.status(404).json({ message: 'Task not found.' })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await service.remove(params.id)
      return response.json({ success: true })
    } catch {
      return response.status(404).json({ message: 'Task not found.' })
    }
  }
}
