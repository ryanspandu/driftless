import type { HttpContext } from '@adonisjs/core/http'
import AnnouncementsService from '#plugins/announcements/services/announcements_service'
import { renderPage } from '#helpers/inertia_render'

const service = new AnnouncementsService()

export default class AnnouncementsController {
  /** Admin dashboard page (FE: plugins/announcements/ui/admin). */
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'plugins/announcements/admin/index', {})
  }

  async index({ response }: HttpContext) {
    return response.json(await service.findAll())
  }

  async store({ request, auth, response }: HttpContext) {
    const { title, body, published } = request.only(['title', 'body', 'published'])
    if (!title || typeof title !== 'string') {
      return response.status(422).json({ message: 'Title is required.' })
    }
    const row = await service.create(auth.user?.id ?? null, {
      title,
      body: typeof body === 'string' ? body : '',
      published: Boolean(published),
    })
    return response.status(201).json(row)
  }

  async update({ params, request, response }: HttpContext) {
    const { title, body, published } = request.only(['title', 'body', 'published'])
    try {
      const row = await service.update(params.id, {
        title: typeof title === 'string' ? title : undefined,
        body: typeof body === 'string' ? body : undefined,
        published: typeof published === 'boolean' ? published : undefined,
      })
      return response.json(row)
    } catch {
      return response.status(404).json({ message: 'Announcement not found.' })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await service.remove(params.id)
      return response.json({ success: true })
    } catch {
      return response.status(404).json({ message: 'Announcement not found.' })
    }
  }
}
