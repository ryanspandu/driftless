import type { HttpContext } from '@adonisjs/core/http'
import RedirectsService from '#services/redirects_service'

const service = new RedirectsService()

export default class RedirectsController {
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/redirects', {})
  }

  async list({ response }: HttpContext) {
    return response.json({ items: await service.list() })
  }

  async store({ request, response }: HttpContext) {
    try {
      const item = await service.create({
        fromPath: String(request.input('fromPath') ?? ''),
        toPath: String(request.input('toPath') ?? ''),
        status: Number(request.input('status')) || 301,
      })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const item = await service.update(String(params.id), {
        fromPath: request.input('fromPath'),
        toPath: request.input('toPath'),
        status: request.input('status') !== undefined ? Number(request.input('status')) : undefined,
      })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    await service.delete(String(params.id))
    return response.json({ ok: true })
  }
}
