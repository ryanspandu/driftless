import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import CmsCollection from '#models/cms_collection'
import Page from '#models/page'
import FormSubmission from '#models/form_submission'
import { renderPage } from '#helpers/inertia_render'

export default class DashboardController {
  async index({ inertia }: HttpContext) {
    const [totalCollections, totalPages, totalForms, totalUsers] = await Promise.all([
      CmsCollection.query().whereNull('deleted_at').count('* as total'),
      Page.query().whereNull('deleted_at').count('* as total'),
      FormSubmission.query().count('* as total'),
      User.query().whereNull('deleted_at').count('* as total'),
    ])

    return renderPage(inertia, 'admin/dashboard', {
      stats: {
        totalCollections: Number((totalCollections[0] as any)?.$extras?.total ?? 0),
        totalPages: Number((totalPages[0] as any)?.$extras?.total ?? 0),
        totalForms: Number((totalForms[0] as any)?.$extras?.total ?? 0),
        totalUsers: Number((totalUsers[0] as any)?.$extras?.total ?? 0),
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
    return renderPage(inertia, 'admin/profile', {
      user: { ...user.serialize(), twoFactorEnabled: user.twoFactorEnabledAt != null },
    })
  }
}
