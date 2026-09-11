import type { HttpContext } from '@adonisjs/core/http'
import FormService from '#services/form_service'

const service = new FormService()

/**
 * Named form definitions — the admin CRUD behind the Forms list + per-form
 * builder. Submissions are handled by `forms_controller`; this owns the schema.
 */
export default class FormsDefinitionsController {
  // ── Inertia page renders ───────────────────────────────────────────────────
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/forms/index', {})
  }

  async submissionsPage({ inertia }: HttpContext) {
    return inertia.render('admin/forms/submissions', {})
  }

  async detailPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/forms/detail', { id: String(params.id) })
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async index({ response }: HttpContext) {
    return response.json(await service.list())
  }

  async store({ request, response }: HttpContext) {
    try {
      const item = await service.create(request.only(['title', 'slug']))
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async show({ params, response }: HttpContext) {
    return response.json(await service.get(String(params.id)))
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const item = await service.update(
        String(params.id),
        request.only(['title', 'slug', 'successMessage', 'status', 'fields'])
      )
      return response.json(item)
    } catch (e) {
      // Let a missing form 404 through; a bad schema/title is a 422.
      if ((e as { code?: string }).code === 'E_ROW_NOT_FOUND') throw e
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    await service.delete(String(params.id))
    return response.json({ ok: true })
  }

  async duplicate({ params, response }: HttpContext) {
    return response.status(201).json(await service.duplicate(String(params.id)))
  }
}
