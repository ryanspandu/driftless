import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import MediaService, { type MediaOriginMeta } from '#services/media_service'

const media = new MediaService()

const ORIGINS = new Set(['upload', 'url', 'crop', 'reference', 'placeholder'])

/**
 * Builder-API media surface. Upload is multipart only — the MCP client fetches
 * any source URL itself (with placeholder/SSRF guards) and posts the bytes, so
 * the server keeps its single, well-audited ingest path (`MediaService.upload`,
 * which sniffs the real file type and rejects unsafe SVGs). `crop` cuts a region
 * out of an existing image into a new asset (for reusing a design reference's
 * own photos). Gated by `media:manage`.
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
    // Provenance carried by the transport (never trusted for security — purely
    // descriptive). Clamp origin to the known set.
    const rawOrigin = String(request.input('origin', 'upload'))
    const meta: MediaOriginMeta = {
      origin: (ORIGINS.has(rawOrigin) ? rawOrigin : 'upload') as MediaOriginMeta['origin'],
      sourceUrl: request.input('sourceUrl') ? String(request.input('sourceUrl')) : null,
      title: request.input('title') ? String(request.input('title')) : null,
      alt: request.input('alt') ? String(request.input('alt')) : null,
    }
    try {
      return response.status(201).json(await media.upload(file, user.id, undefined, meta))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Crop a rectangle out of an existing image into a new asset. */
  async crop({ params, request, auth, response }: HttpContext) {
    const user = auth.user as User
    const num = (v: unknown) => (v === undefined || v === null ? Number.NaN : Number(v))
    const rect = {
      x: num(request.input('x')),
      y: num(request.input('y')),
      width: num(request.input('width')),
      height: num(request.input('height')),
      targetWidth: request.input('targetWidth') !== undefined ? num(request.input('targetWidth')) : undefined,
    }
    try {
      const dto = await media.cropToNew(String(params.id), rect, user.id, {
        title: request.input('title') ? String(request.input('title')) : null,
        alt: request.input('alt') ? String(request.input('alt')) : null,
      })
      return response.status(201).json(dto)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Patch alt/title/description on an existing media row. */
  async updateMeta({ params, request, response }: HttpContext) {
    const patch = request.only(['alt', 'title', 'description'])
    try {
      return response.json(await media.updateMeta(String(params.id), patch))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async index({ request, response }: HttpContext) {
    const page = request.input('page')
    const pageSize = request.input('pageSize')
    const search = request.input('search')
    const origin = request.input('origin')
    return response.json(
      await media.list({
        page: page !== undefined ? Number(page) : undefined,
        pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
        search,
        origin: origin ? String(origin) : undefined,
      })
    )
  }
}
