import type { HttpContext } from '@adonisjs/core/http'
import FormSubmissionService from '#services/form_submission_service'

const service = new FormSubmissionService()

export default class FormsController {
  /**
   * Public: receive a builder-form submission. CSRF-protected (the form sends
   * the XSRF token) and rate-limited. Always answers 200 so a broken store
   * never surfaces to a visitor.
   */
  async submit(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      await service.record(ctx, {
        form: request.input('form') ? String(request.input('form')) : undefined,
        page: request.input('page') ? String(request.input('page')) : null,
        fields: request.input('fields') ?? {},
      })
    } catch {
      // Swallow — a submission failure must not read as a broken page.
    }
    return response.json({ ok: true })
  }

  // ── Admin inbox ──────────────────────────────────────────────────────────

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/forms', {})
  }

  async list({ request, response }: HttpContext) {
    const status = request.input('status')
    return response.json(await service.list({ status: status || undefined }))
  }

  async updateStatus({ params, request, response }: HttpContext) {
    const status = String(request.input('status'))
    if (!['new', 'read', 'spam'].includes(status)) {
      return response.status(422).json({ message: 'Invalid status.' })
    }
    return response.json(await service.updateStatus(String(params.id), status as never))
  }

  async destroy({ params, response }: HttpContext) {
    await service.delete(String(params.id))
    return response.json({ ok: true })
  }
}
