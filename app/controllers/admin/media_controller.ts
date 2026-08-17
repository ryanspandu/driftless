import type { HttpContext } from '@adonisjs/core/http'
import MediaService from '#services/media_service'

const mediaService = new MediaService()

export default class MediaController {
  async index({ request, response }: HttpContext) {
    const { page, pageSize, search, dateFrom, dateTo } = request.qs()
    const result = await mediaService.list({
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      search: typeof search === 'string' ? search : undefined,
      dateFrom: typeof dateFrom === 'string' ? dateFrom : undefined,
      dateTo: typeof dateTo === 'string' ? dateTo : undefined,
    })
    return response.json(result)
  }

  async show({ params, response }: HttpContext) {
    const media = await mediaService.findOne(params.id)
    return response.json(media)
  }

  async update({ params, request, response }: HttpContext) {
    const { title, description, alt } = request.only(['title', 'description', 'alt'])
    const media = await mediaService.updateMeta(params.id, { title, description, alt })
    return response.json(media)
  }

  async replace({ params, request, response }: HttpContext) {
    const file = request.file('file', {
      size: '10mb',
      extnames: ['jpg', 'jpeg', 'png', 'webp'],
    })

    if (!file) {
      return response.status(422).json({ message: 'No file uploaded' })
    }

    const { width, height } = request.only(['width', 'height'])
    const media = await mediaService.replaceFile(params.id, file, {
      width: typeof width === 'string' ? Number(width) : null,
      height: typeof height === 'string' ? Number(height) : null,
    })
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

    const { width, height } = request.only(['width', 'height'])
    const media = await mediaService.upload(file, auth.user!.id, {
      width: typeof width === 'string' ? Number(width) : null,
      height: typeof height === 'string' ? Number(height) : null,
    })
    return response.status(201).json(media)
  }

  /**
   * Serve a stored file.
   *
   * Public and unauthenticated on purpose: these URLs are embedded in published
   * pages. It exists because `MEDIA_STORAGE_PATH` can put the library outside
   * `public/`, where `@adonisjs/static` cannot reach it — the default layout is
   * still served statically and never gets here.
   */
  async serve({ params, response }: HttpContext) {
    const segments: string[] = Array.isArray(params['*']) ? params['*'] : []
    const path = segments.length ? mediaService.resolveFilePath(segments.join('/')) : null
    if (!path) return response.notFound({ message: 'Not found' })

    // Content-addressed names (a ULID per upload), so a long cache is safe; an
    // edit in place is cache-busted by the `?v=` the client appends.
    response.header('Cache-Control', 'public, max-age=31536000')
    return response.download(path)
  }

  async destroy({ params, response }: HttpContext) {
    await mediaService.remove(params.id)
    return response.json({ success: true })
  }

  async trash({ response }: HttpContext) {
    const items = await mediaService.findTrashed()
    return response.json(items)
  }

  async restore({ params, response }: HttpContext) {
    const media = await mediaService.restore(params.id)
    return response.json(media)
  }

  async forceDestroy({ params, response }: HttpContext) {
    await mediaService.forceDelete(params.id)
    return response.json({ success: true })
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/media', {})
  }
}
