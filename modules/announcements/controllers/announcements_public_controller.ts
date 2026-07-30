import type { HttpContext } from '@adonisjs/core/http'
import AnnouncementsService from '#modules/announcements/services/announcements_service'
import { renderPage } from '#helpers/inertia_render'

const service = new AnnouncementsService()

export default class AnnouncementsPublicController {
  /** Public page (FE: plugins/announcements/ui/public). */
  async page({ inertia }: HttpContext) {
    const announcements = await service.findPublished()
    return renderPage(inertia, 'plugins/announcements/public/index', { announcements })
  }
}
