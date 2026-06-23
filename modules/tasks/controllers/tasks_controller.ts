import type { HttpContext } from '@adonisjs/core/http'
import TasksService from '#modules/tasks/services/tasks_service'
import { renderPage } from '#helpers/inertia_render'

const service = new TasksService()

const FIELDS = ['title', 'description', 'status', 'priority', 'dueDate']

export default class TasksController {
  /** Admin page (FE: modules/tasks/ui/admin). */
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/tasks/admin/index', {})
  }

  async index({ response }: HttpContext) {
    return response.json(await service.findAll())
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
      })
      return response.json(row)
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
