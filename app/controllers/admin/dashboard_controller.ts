import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Content from '#models/content'
import { renderPage } from '#helpers/inertia_render'

export default class DashboardController {
  async index({ inertia }: HttpContext) {
    const [totalUsers, totalContent, publishedContent, draftContent] = await Promise.all([
      User.query().whereNull('deleted_at').count('* as total'),
      Content.query().whereNull('deleted_at').count('* as total'),
      Content.query().where('status', 'PUBLISHED').whereNull('deleted_at').count('* as total'),
      Content.query().where('status', 'DRAFT').whereNull('deleted_at').count('* as total'),
    ])

    return renderPage(inertia, 'admin/dashboard', {
      stats: {
        totalUsers: Number((totalUsers[0] as any)?.$extras?.total ?? 0),
        totalContent: Number((totalContent[0] as any)?.$extras?.total ?? 0),
        publishedContent: Number((publishedContent[0] as any)?.$extras?.total ?? 0),
        draftContent: Number((draftContent[0] as any)?.$extras?.total ?? 0),
      },
    })
  }

  async analyticsPage({ inertia }: HttpContext) {
    return inertia.render('admin/analytics', {})
  }

  async profilePage({ inertia, auth }: HttpContext) {
    const user = auth.user! as User
    await user.load('roles')
    // Pass a serialized plain object (not the raw Lucid model) so Inertia sends
    // flat props and the password hash / model internals are not leaked.
    return renderPage(inertia, 'admin/profile', { user: user.serialize() })
  }
}
