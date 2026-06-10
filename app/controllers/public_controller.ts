import type { HttpContext } from '@adonisjs/core/http'
import ContentService from '#services/content_service'
import { IntegrationSettingsService } from '#services/settings_service'
import { renderPage } from '#helpers/inertia_render'

const contentService = new ContentService()
const integrationService = new IntegrationSettingsService()

export default class PublicController {
  async home({ inertia }: HttpContext) {
    const posts = await contentService.findPublishedList()
    const authConfig = await integrationService.getAuthPublicConfig()
    return renderPage(inertia, 'home', { posts, authConfig })
  }

  async post({ params, inertia }: HttpContext) {
    const post = await contentService.findPublishedBySlug(params.slug)
    return renderPage(inertia, 'posts/show', { post })
  }

  async offline({ inertia }: HttpContext) {
    return inertia.render('offline', {})
  }
}
