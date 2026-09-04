import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import MediaService from '#services/media_service'

const media = new MediaService()

/**
 * Builder-API media upload. Multipart only — the MCP client fetches any source
 * URL itself and posts the bytes, so the server keeps its single, well-audited
 * ingest path (`MediaService.upload`, which sniffs the real file type and
 * rejects unsafe SVGs). Gated by `media:manage`.
 */
export default class BuilderMediaController {
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user as User
    const file = request.file('file', {
      size: '25mb',
      extnames: [
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'svg',
        'pdf',
        'doc',
        'docx',
        'woff',
        'woff2',
        'ttf',
        'otf',
      ],
    })
    if (!file) {
      return response.status(422).json({ message: 'A `file` multipart field is required' })
    }
    if (!file.isValid) {
      return response.status(422).json({ message: file.errors[0]?.message ?? 'Invalid upload' })
    }
    try {
      return response.status(201).json(await media.upload(file, user.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async index({ request, response }: HttpContext) {
    const page = request.input('page')
    const pageSize = request.input('pageSize')
    const search = request.input('search')
    return response.json(
      await media.list({
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        search,
      })
    )
  }
}
