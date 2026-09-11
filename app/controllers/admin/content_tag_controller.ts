import type { HttpContext } from '@adonisjs/core/http'
import ContentTagService from '#services/content_tag_service'

const tags = new ContentTagService()

export default class ContentTagController {
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/content/tags', {})
  }

  async index({ response }: HttpContext) {
    return response.json(await tags.list())
  }

  async store({ request, response }: HttpContext) {
    const { name, slug, description } = request.all()
    try {
      const tag = await tags.create({ name, slug, description })
      return response.status(201).json(tag)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { name, slug, description } = request.all()
    try {
      const tag = await tags.update(params.id, { name, slug, description })
      return response.json(tag)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await tags.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
