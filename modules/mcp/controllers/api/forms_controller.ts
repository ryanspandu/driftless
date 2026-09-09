import type { HttpContext } from '@adonisjs/core/http'
import FormService from '#services/form_service'

const forms = new FormService()

/**
 * Builder-API surface for named form definitions (the Contact/Signup forms a
 * FormBlock renders). Thin over `FormService` (the validation authority): a bad
 * field schema throws and becomes a 422 with the message, so an AI can fix it.
 * Submissions are NOT exposed here — this authors the form, not its inbox.
 */
export default class BuilderFormsController {
  async index({ response }: HttpContext) {
    return response.json(await forms.list())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await forms.get(String(params.id)))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async store({ request, response }: HttpContext) {
    try {
      return response.status(201).json(await forms.create(request.only(['title', 'slug'])))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const item = await forms.update(
        String(params.id),
        request.only(['title', 'slug', 'successMessage', 'status', 'fields'])
      )
      return response.json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    await forms.delete(String(params.id))
    return response.json({ ok: true })
  }
}
