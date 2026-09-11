import type { HttpContext } from '@adonisjs/core/http'
import ContentCategoryService from '#services/content_category_service'

const categories = new ContentCategoryService()

export default class ContentCategoryController {
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/content/categories', {})
  }

  async index({ response }: HttpContext) {
    return response.json(await categories.list())
  }

  async store({ request, response }: HttpContext) {
    const { name, slug, description, parentId } = request.all()
    try {
      const cat = await categories.create({ name, slug, description, parentId })
      return response.status(201).json(cat)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { name, slug, description, parentId } = request.all()
    try {
      const cat = await categories.update(params.id, { name, slug, description, parentId })
      return response.json(cat)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await categories.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
