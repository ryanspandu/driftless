import type { HttpContext } from '@adonisjs/core/http'
import FormSubmissionService, { FormValidationError } from '#services/form_submission_service'
import FormUploadService, { FormUploadError } from '#services/form_upload_service'

const service = new FormSubmissionService()
const uploads = new FormUploadService()

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
    } catch (error) {
      // A defined form's validation failure is the visitor's to fix — surface it
      // as 422 with per-field messages. Anything else is swallowed (a broken
      // store must not read as a broken page).
      if (error instanceof FormValidationError) {
        return response.status(422).json({ ok: false, errors: error.errors })
      }
    }
    return response.json({ ok: true })
  }

  /**
   * Public: receive one file for a form's `file` field. Rate-limited harder than
   * submit. Returns an opaque token the form then submits; the file is validated
   * by magic bytes, stored in isolation, and only ever served to an admin.
   */
  async upload({ request, response }: HttpContext) {
    const file = request.file('file', { size: '10mb' })
    if (!file) return response.status(422).json({ message: 'No file was uploaded.' })
    try {
      const form = request.input('form') ? String(request.input('form')) : undefined
      return response.json(await uploads.store(file, form))
    } catch (e) {
      const message = e instanceof FormUploadError ? e.message : 'That file could not be accepted.'
      return response.status(422).json({ message })
    }
  }

  /** Admin-only: stream an uploaded file (never publicly reachable). */
  async serveUpload({ params, response }: HttpContext) {
    const found = await uploads.find(String(params.token))
    if (!found) return response.status(404).json({ message: 'Not found.' })
    const safe = found.filename.replace(/[^\w.\- ]+/g, '_')
    response.header('Content-Disposition', `attachment; filename="${safe}"`)
    response.type(found.mime)
    return response.download(found.path)
  }

  // ── Admin inbox API (pages render from forms_definitions_controller) ───────

  async list({ request, response }: HttpContext) {
    const status = request.input('status')
    const formId = request.input('formId')
    return response.json(
      await service.list({ status: status || undefined, formId: formId || undefined })
    )
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
