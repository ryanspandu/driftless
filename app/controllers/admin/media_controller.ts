import type { HttpContext } from '@adonisjs/core/http'
import MediaService from '#services/media_service'

const mediaService = new MediaService()

export default class MediaController {
  async index({ request, response }: HttpContext) {
    const { page, pageSize } = request.qs()
    const result = await mediaService.list({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 })
    return response.json(result)
  }

  async show({ params, response }: HttpContext) {
    const media = await mediaService.findOne(params.id)
    return response.json(media)
  }

  async store({ request, auth, response }: HttpContext) {
    const file = request.file('file', {
      size: '10mb',
      extnames: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'doc', 'docx'],
    })

    if (!file) {
      return response.status(422).json({ message: 'No file uploaded' })
    }

    const media = await mediaService.upload(file, auth.user!.id)
    return response.status(201).json(media)
  }

  async destroy({ params, response }: HttpContext) {
    await mediaService.remove(params.id)
    return response.json({ success: true })
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/media', {})
  }
}
