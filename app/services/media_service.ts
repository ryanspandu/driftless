import { MultipartFile } from '@adonisjs/core/bodyparser'
import app from '@adonisjs/core/services/app'
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
  width: number | null
  height: number | null
  authorId: number | null
  createdAt: string
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
    return app.publicPath('uploads')
  }

  async list(params: { page?: number; pageSize?: number }): Promise<PaginatedMedia> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

    const paginated = await Media.query()
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .paginate(page, pageSize)

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
      width: media.width,
      height: media.height,
      authorId: media.authorId,
      createdAt: media.createdAt.toISO()!,
    }
  }
}
