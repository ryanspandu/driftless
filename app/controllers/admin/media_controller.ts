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
    if (!file.isValid) {
      return response.status(422).json({ message: 'Invalid upload', errors: file.errors })
    }

    const { width, height } = request.only(['width', 'height'])
    try {
      const media = await mediaService.replaceFile(params.id, file, {
        width: typeof width === 'string' ? Number(width) : null,
        height: typeof height === 'string' ? Number(height) : null,
      })
      return response.json(media)
    } catch (error) {
      return response.status(422).json({ message: (error as Error).message })
    }
  }

  async store({ request, auth, response }: HttpContext) {
    const file = request.file('file', {
      size: '10mb',
      extnames: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'doc', 'docx'],
    })

    if (!file) {
      return response.status(422).json({ message: 'No file uploaded' })
    }
    if (!file.isValid) {
      return response.status(422).json({ message: 'Invalid upload', errors: file.errors })
    }

    const { width, height } = request.only(['width', 'height'])
    try {
      const media = await mediaService.upload(file, auth.user!.id, {
        width: typeof width === 'string' ? Number(width) : null,
        height: typeof height === 'string' ? Number(height) : null,
      })
      return response.status(201).json(media)
    } catch (error) {
      return response.status(422).json({ message: (error as Error).message })
    }
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
    const filename = segments.length ? segments.join('/') : null
    const media = filename
      ? await mediaService.findByFilename(filename)
      : null
    const path = media ? mediaService.resolveFilePath(media.filename) : null
    if (!media || !path) return response.notFound({ message: 'Not found' })

    return mediaService.serve(response, path, media)
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
