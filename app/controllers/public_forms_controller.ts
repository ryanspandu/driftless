import type { HttpContext } from '@adonisjs/core/http'
import Form from '#models/form'

/**
 * Public read of an active form's schema, so a page can render it. Only the
 * fields an author needs are exposed — no internal ids, status, or counts.
 */
export default class PublicFormsController {
  async show({ params, response }: HttpContext) {
    const form = await Form.query()
      .where('slug', String(params.slug))
      .where('status', 'active')
      .first()
    if (!form) return response.status(404).json({ message: 'Form not found' })
    return response.json({
      slug: form.slug,
      title: form.title,
      fields: form.fields,
      successMessage: form.successMessage,
    })
  }
}
