import type { MultipartFile } from '@adonisjs/core/bodyparser'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { DateTime } from 'luxon'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { extname, join } from 'node:path'
import Media from '#models/media'
import { newUlid } from '#services/ulid_service'

export interface MediaDto {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
  title: string | null
  description: string | null
  alt: string | null
  width: number | null
  height: number | null
  authorId: number | null
  createdAt: string
  updatedAt: string | null
}

/** Trim and collapse empty strings to null so metadata stays clean. */
function normalizeText(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = v.trim()
  return t.length ? t : null
}

export interface PaginatedMedia {
  items: MediaDto[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export default class MediaService {
  private get uploadDir(): string {
    /**
     * `MEDIA_STORAGE_PATH` was declared in `start/env.ts` and never read — an
     * env var that looked meaningful and did nothing. It is honoured now, so an
     * operator can put the media library on a mounted volume.
     *
     * The default is unchanged. In the release layout `public/uploads` is a
     * symlink out to `shared/uploads`, which is what keeps the library from
     * being deleted by every rebuild; overriding this points somewhere else
     * entirely and takes that protection with it.
     */
    const configured = env.get('MEDIA_STORAGE_PATH')
    return configured ? app.makePath(configured) : app.publicPath('uploads')
  }

  async list(params: {
    page?: number
    pageSize?: number
    search?: string
    dateFrom?: string
    dateTo?: string
  }): Promise<PaginatedMedia> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

    const query = Media.query().whereNull('deleted_at')

    const search = params.search?.trim()
    if (search) {
      query.where((b) => {
        b.whereILike('filename', `%${search}%`)
          .orWhereILike('title', `%${search}%`)
          .orWhereILike('alt', `%${search}%`)
      })
    }

    // Date filtering is date-only (no timezone math): `>= from` and `< to + 1 day`.
    if (params.dateFrom) {
      const from = DateTime.fromISO(params.dateFrom)
      if (from.isValid) query.where('created_at', '>=', from.toSQLDate()!)
    }
    if (params.dateTo) {
      const to = DateTime.fromISO(params.dateTo)
      if (to.isValid) query.where('created_at', '<', to.plus({ days: 1 }).toSQLDate()!)
    }

    const paginated = await query.orderBy('created_at', 'desc').paginate(page, pageSize)

    return {
      items: paginated.all().map((m) => this.toDto(m)),
      page,
      pageSize,
      total: paginated.total,
      totalPages: paginated.lastPage,
    }
  }

  async findOne(id: string): Promise<MediaDto> {
    const media = await Media.query().where('id', id).whereNull('deleted_at').firstOrFail()
    return this.toDto(media)
  }

  async upload(file: MultipartFile, authorId: number | null): Promise<MediaDto> {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true })
    }

    const id = newUlid()
    const ext = extname(file.clientName || file.fieldName || '.bin')
    const filename = `${id}${ext}`

    await file.move(this.uploadDir, { name: filename, overwrite: false })

    const media = await Media.create({
      id,
      filename,
      mimeType: file.type ? `${file.type}/${file.subtype}` : 'application/octet-stream',
      size: file.size ?? 0,
      url: `/uploads/${filename}`,
      width: null,
      height: null,
      authorId,
    })

    return this.toDto(media)
  }

  /** Update editable metadata (title, description, alt text). */
  async updateMeta(
    id: string,
    patch: { title?: string | null; description?: string | null; alt?: string | null }
  ): Promise<MediaDto> {
    const media = await Media.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (patch.title !== undefined) media.title = normalizeText(patch.title)
    if (patch.description !== undefined) media.description = normalizeText(patch.description)
    if (patch.alt !== undefined) media.alt = normalizeText(patch.alt)
    await media.save()
    return this.toDto(media)
  }

  /**
   * Overwrite an existing image's bytes in place (crop/resize result). The file
   * keeps its original name + extension so the public URL stays stable; callers
   * cache-bust on the client with the new `updatedAt`. New dimensions/size come
   * from the client, which produced the edited blob.
   */
  async replaceFile(
    id: string,
    file: MultipartFile,
    dims: { width?: number | null; height?: number | null }
  ): Promise<MediaDto> {
    const media = await Media.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true })
    }

    await file.move(this.uploadDir, { name: media.filename, overwrite: true })

    media.size = file.size ?? media.size
    if (typeof dims.width === 'number' && Number.isFinite(dims.width)) {
      media.width = Math.round(dims.width)
    }
    if (typeof dims.height === 'number' && Number.isFinite(dims.height)) {
      media.height = Math.round(dims.height)
    }
    await media.save()
    return this.toDto(media)
  }

  async remove(id: string): Promise<void> {
    const media = await Media.query().where('id', id).whereNull('deleted_at').firstOrFail()
    media.deletedAt = new Date() as any
    await media.save()
  }

  /** Soft-deleted media (the Trash). */
  async findTrashed(): Promise<MediaDto[]> {
    const rows = await Media.query().whereNotNull('deleted_at').orderBy('created_at', 'desc')
    return rows.map((m) => this.toDto(m))
  }

  async restore(id: string): Promise<MediaDto> {
    const media = await Media.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    media.deletedAt = null as any
    await media.save()
    return this.toDto(media)
  }

  /** Permanently delete a trashed media row and its file on disk. */
  async forceDelete(id: string): Promise<void> {
    const media = await Media.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    const filePath = join(this.uploadDir, media.filename)
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true })
    }
    await media.delete()
  }

  private toDto(media: Media): MediaDto {
    return {
      id: media.id,
      filename: media.filename,
      mimeType: media.mimeType,
      size: media.size,
      url: media.url,
      title: media.title,
      description: media.description,
      alt: media.alt,
      width: media.width,
      height: media.height,
      authorId: media.authorId,
      createdAt: media.createdAt.toISO()!,
      updatedAt: media.updatedAt?.toISO() ?? null,
    }
  }
}
