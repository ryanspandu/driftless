import type { HttpContext } from '@adonisjs/core/http'
import ContentService from '#services/content_service'

const contentService = new ContentService()

export default class ContentController {
  async index({ response }: HttpContext) {
    const items = await contentService.findAll()
    return response.json(items)
  }

  async show({ params, response }: HttpContext) {
    const item = await contentService.findOne(params.id)
    return response.json(item)
  }

  async checkSlug({ request, response }: HttpContext) {
    const slug = String(request.input('slug', ''))
    const excludeId = request.input('excludeId')
    const available = await contentService.isSlugAvailable(
      slug,
      excludeId ? String(excludeId) : undefined
    )
    return response.json({ available })
  }

  async store({ request, auth, response }: HttpContext) {
    const { title, slug, body, status } = request.all()
    try {
      const item = await contentService.create(auth.user!.id, { title, slug, body, status })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { title, slug, body, status } = request.all()
    try {
      const item = await contentService.update(params.id, { title, slug, body, status })
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    await contentService.remove(params.id)
    return response.json({ success: true })
  }

  async trash({ response }: HttpContext) {
    const items = await contentService.findTrashed()
    return response.json(items)
  }

  async restore({ params, response }: HttpContext) {
    try {
      const item = await contentService.restore(params.id)
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async forceDestroy({ params, response }: HttpContext) {
    await contentService.forceDelete(params.id)
    return response.json({ success: true })
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/content', {})
  }

  async newPage({ inertia }: HttpContext) {
    return inertia.render('admin/content/new', {})
  }

  async editPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/content/edit', { id: params.id })
  }
}
