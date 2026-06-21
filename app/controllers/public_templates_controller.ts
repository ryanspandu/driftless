import type { HttpContext } from '@adonisjs/core/http'
import TemplatesService from '#services/templates_service'

const templatesService = new TemplatesService()

export default class PublicTemplatesController {
  /** Public, read-only template content — consumed by client-side TemplateRef blocks. */
  async show({ params, response }: HttpContext) {
    try {
      const t = await templatesService.find(params.id)
      return response.json({ id: t.id, content: t.content })
    } catch {
      return response.notFound({ message: 'Not found' })
    }
  }
}
