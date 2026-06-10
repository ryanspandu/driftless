import type { HttpContext } from '@adonisjs/core/http'
import ContentService from '#services/content_service'

const contentService = new ContentService()

export default class PublicContentController {
  async index({ response }: HttpContext) {
    const posts = await contentService.findPublishedList()
    return response.json(posts)
  }

  async show({ params, response }: HttpContext) {
    try {
      const post = await contentService.findPublishedBySlug(params.slug)
      return response.json(post)
    } catch {
      return response.status(404).json({ message: 'Not found' })
    }
  }
}
