import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { DateTime } from 'luxon'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative } from 'node:path'
import { fileTypeFromFile } from 'file-type'
import sharp from 'sharp'
import Media from '#models/media'
import MediaVariant from '#models/media_variant'
import { mediaUrlPrefix } from '#services/media_url'
import { newUlid } from '#services/ulid_service'
import { sanitizeSvg } from '#services/html_sanitizer_service'

/** Widths (px) generated for responsive `srcset`; never upscales past the original. */
const VARIANT_WIDTHS = [480, 960, 1440]
/** Mime types we run through sharp (animated GIF + SVG are left as-is). */
const RASTER_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface MediaVariantDto {
  width: number
  height: number | null
  format: string
  url: string
}

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
  /** Where the bytes came from: upload | url | crop | reference | placeholder. */
  origin: string
  /** External URL fetched (origin url/placeholder), else null. */
  sourceUrl: string | null
  /** The media this was cropped from (origin crop), else null. */
  sourceMediaId: string | null
  /** Responsive webp derivatives, ascending by width (empty for non-raster). */
  variants: MediaVariantDto[]
  createdAt: string
  updatedAt: string | null
}

/** Provenance metadata carried through an upload. */
export interface MediaOriginMeta {
  origin?: 'upload' | 'url' | 'crop' | 'reference' | 'placeholder'
  sourceUrl?: string | null
  sourceMediaId?: string | null
  title?: string | null
  alt?: string | null
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
     * User media must never be served by the static middleware: SVG and HTML
     * are active content in browsers. The controlled media route below owns
     * all delivery, including the default layout.
     */
    const configured = env.get('MEDIA_STORAGE_PATH')
    const target = configured ? app.makePath(configured) : app.makePath('storage/media')
    const rel = relative(app.publicPath(), target)
    if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) {
      throw new Error('MEDIA_STORAGE_PATH must be outside public/')
    }
    return target
  }

  /** Exposed for the administrator-only media inventory command. */
  get storagePath(): string {
    return this.uploadDir
  }

  /**
   * URL prefix stored on every media row.
   *
   * `MEDIA_URL_PREFIX` was the other half of `MEDIA_STORAGE_PATH` and had the
   * same problem for longer: declared in `start/env.ts`, set in `.env.example`,
   * and read by nobody. So the moment an operator followed the example file,
   * uploads landed in `./storage/media` while their URLs still claimed
   * `/uploads/…` — a path the static middleware cannot see, because it only
   * serves `public/`. Every uploaded image 404ed, and nothing said why.
   *
   * The default stays `/uploads` so rows written before this keep resolving.
   */
  get urlPrefix(): string {
    return mediaUrlPrefix()
  }

  /**
   * Absolute path of a stored file, for the route that serves it.
   *
   * Returns null rather than a path whenever the name escapes the media
   * directory — the filename reaches this straight off a URL, so `../` in it is
   * an attempt to read the rest of the disk, not a typo.
   */
  resolveFilePath(name: string): string | null {
    const base = this.uploadDir
    const full = join(base, name)
    const rel = relative(base, full)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
    return existsSync(full) ? full : null
  }

  async list(params: {
    page?: number
    pageSize?: number
    search?: string
    dateFrom?: string
    dateTo?: string
    origin?: string
  }): Promise<PaginatedMedia> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

    const query = Media.query().whereNull('deleted_at')

    const origin = params.origin?.trim()
    if (origin) query.where('origin', origin)

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

    query.preload('variants')
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
    const media = await Media.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('variants')
      .firstOrFail()
    return this.toDto(media)
  }

  async findByFilename(filename: string): Promise<Media | null> {
    if (!/^[0-9A-HJKMNP-TV-Z]{26}\.[a-z0-9]+$/i.test(filename)) return null
    return Media.query().where('filename', filename).whereNull('deleted_at').first()
  }

  private async inspectUpload(
    file: MultipartFile,
    allowed: Set<string>
  ): Promise<{ mimeType: string; ext: string; svg?: string }> {
    if (!file.isValid || !file.tmpPath) throw new Error('Invalid upload')
    const bytes = await readFile(file.tmpPath)
    const text = bytes.subarray(0, 1024).toString('utf8')
    if (/^\s*<svg(?:\s|>)/i.test(text)) {
      const svg = sanitizeSvg(bytes.toString('utf8'))
      if (!svg || !allowed.has('image/svg+xml')) throw new Error('Unsafe SVG upload rejected')
      return { mimeType: 'image/svg+xml', ext: 'svg', svg }
    }
    const detected = await fileTypeFromFile(file.tmpPath)
    if (!detected || !allowed.has(detected.mime)) {
      throw new Error('Uploaded bytes do not match an allowed file type')
    }
    return { mimeType: detected.mime, ext: detected.ext }
  }

  private async persistUpload(file: MultipartFile, path: string, svg?: string): Promise<number> {
    if (svg !== undefined) {
      await writeFile(path, svg, { flag: 'wx' })
      await rm(file.tmpPath!, { force: true })
      return Buffer.byteLength(svg)
    }
    await file.move(this.uploadDir, { name: path.split('/').pop(), overwrite: false })
    return file.size ?? 0
  }

  /**
   * Generate responsive webp derivatives for a raster image and record the
   * real intrinsic size on the media row (more trustworthy than the client's).
   *
   * Each derivative is a fresh ULID-named file so it has a stable, immutable URL
   * — required because media is served with a one-year immutable cache, so a
   * re-processed image (crop/replace) must never reuse a derivative URL. Old
   * derivatives are removed first. Failures are swallowed: a page that can't be
   * optimised must still upload.
   */
  private async generateVariants(media: Media, sourceAbsPath: string): Promise<void> {
    try {
      // Clear any prior derivatives (replace/crop path).
      const old = await MediaVariant.query().where('media_id', media.id)
      for (const v of old) {
        const name = v.url.split('/').pop()
        const p = name ? this.resolveFilePath(name) : null
        if (p) rmSync(p, { force: true })
      }
      await MediaVariant.query().where('media_id', media.id).delete()

      const meta = await sharp(sourceAbsPath).metadata()
      const origWidth = meta.width ?? null
      const origHeight = meta.height ?? null
      if (origWidth) media.width = origWidth
      if (origHeight) media.height = origHeight
      await media.save()

      if (!origWidth) return
      // Target widths: the presets that fit, plus the original width itself
      // (capped), so `srcset` covers every device up to full resolution.
      const widths = Array.from(
        new Set([...VARIANT_WIDTHS.filter((w) => w < origWidth), origWidth])
      ).sort((a, b) => a - b)

      for (const w of widths) {
        const filename = `${newUlid()}.webp`
        const outPath = join(this.uploadDir, filename)
        const info = await sharp(sourceAbsPath)
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(outPath)
        await MediaVariant.create({
          id: newUlid(),
          mediaId: media.id,
          width: info.width,
          height: info.height,
          format: 'webp',
          url: `${this.urlPrefix}/${filename}`,
          bytes: info.size,
        })
      }
    } catch {
      // Optimisation is best-effort; the original upload already succeeded.
    }
  }

  /** Serve a webp derivative by its filename. Returns false when it is unknown. */
  async serveVariant(response: HttpContext['response'], filename: string): Promise<boolean> {
    const variant = await MediaVariant.query().where('url', `${this.urlPrefix}/${filename}`).first()
    if (!variant) return false
    const path = this.resolveFilePath(filename)
    if (!path) return false
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Content-Security-Policy', "default-src 'none'; sandbox")
    response.header('Content-Type', 'image/webp')
    response.header('Content-Disposition', `inline; filename="${filename}"`)
    response.send(await readFile(path))
    return true
  }

  /**
   * `dimensions` come from the client, which has already decoded the image to
   * preview it — the same arrangement `replaceFile` uses. They were previously
   * left null on every upload, so nothing that needs an image's intrinsic size
   * (the media library's own listing, a background layer's `@2x`) had one to
   * read. Still nullable: an SVG or a format the browser will not decode
   * legitimately has no pixel size to report.
   */
  async upload(
    file: MultipartFile,
    authorId: number | null,
    dimensions?: { width: number | null; height: number | null },
    meta?: MediaOriginMeta
  ): Promise<MediaDto> {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true })
    }

    const inspected = await this.inspectUpload(
      file,
      new Set([
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'font/woff',
        'font/woff2',
        'font/ttf',
        'font/otf',
      ])
    )
    const id = newUlid()
    const filename = `${id}.${inspected.ext}`
    const size = await this.persistUpload(file, join(this.uploadDir, filename), inspected.svg)

    const media = await Media.create({
      id,
      filename,
      mimeType: inspected.mimeType,
      size,
      url: `${this.urlPrefix}/${filename}`,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      authorId,
      origin: meta?.origin ?? 'upload',
      sourceUrl: normalizeText(meta?.sourceUrl),
      title: normalizeText(meta?.title),
      alt: normalizeText(meta?.alt),
    })

    // Optimise raster images into responsive webp derivatives (best-effort).
    if (RASTER_MIMES.has(inspected.mimeType)) {
      await this.generateVariants(media, join(this.uploadDir, filename))
    }
    await media.load('variants')

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

    const inspected = await this.inspectUpload(
      file,
      new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
    )
    const currentExt = extname(media.filename).slice(1).toLowerCase()
    if (currentExt !== inspected.ext)
      throw new Error('Replacement file type must match the existing media type')
    if (inspected.svg !== undefined) throw new Error('SVG replacement is not supported')
    await file.move(this.uploadDir, { name: media.filename, overwrite: true })

    media.mimeType = inspected.mimeType
    media.size = file.size ?? media.size
    if (typeof dims.width === 'number' && Number.isFinite(dims.width)) {
      media.width = Math.round(dims.width)
    }
    if (typeof dims.height === 'number' && Number.isFinite(dims.height)) {
      media.height = Math.round(dims.height)
    }
    await media.save()
    // Regenerate derivatives from the new bytes (old ones are removed inside).
    if (RASTER_MIMES.has(media.mimeType)) {
      await this.generateVariants(media, join(this.uploadDir, media.filename))
    }
    await media.load('variants')
    return this.toDto(media)
  }

  /**
   * Crop a rectangle out of an existing raster image into a BRAND-NEW media row
   * (never overwrites the source — that's `replaceFile`). The whole point is to
   * let an AI reuse a design reference's OWN photos: upload the mockup once, then
   * crop the hero / thumbnail / product shots out of it as first-party assets
   * instead of substituting random stock. Origin is recorded as 'crop' with a
   * link back to the source. The rectangle is validated against the source's
   * intrinsic size (metadata, not the stored width which may be null).
   */
  async cropToNew(
    sourceId: string,
    rect: { x: number; y: number; width: number; height: number; targetWidth?: number },
    authorId: number | null,
    meta?: { title?: string | null; alt?: string | null }
  ): Promise<MediaDto> {
    const source = await Media.query().where('id', sourceId).whereNull('deleted_at').firstOrFail()
    if (!RASTER_MIMES.has(source.mimeType)) {
      throw new Error('Can only crop a JPEG, PNG or WebP image')
    }
    const srcPath = this.resolveFilePath(source.filename)
    if (!srcPath) throw new Error('Source image file is missing')

    const dims = await sharp(srcPath).metadata()
    const iw = dims.width ?? 0
    const ih = dims.height ?? 0
    const left = Math.round(rect.x)
    const top = Math.round(rect.y)
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    if (![left, top, width, height].every((n) => Number.isFinite(n))) {
      throw new Error('x, y, width and height must be numbers')
    }
    if (width < 1 || height < 1) throw new Error('Crop width and height must be at least 1px')
    if (left < 0 || top < 0 || (iw && left + width > iw) || (ih && top + height > ih)) {
      throw new Error(`Crop rectangle is outside the source image (${iw}×${ih})`)
    }

    if (!existsSync(this.uploadDir)) mkdirSync(this.uploadDir, { recursive: true })
    const id = newUlid()
    // Always emit a webp original for a crop — the source pixels are re-encoded
    // regardless, and webp keeps the derivative pipeline uniform.
    const filename = `${id}.webp`
    let pipeline = sharp(srcPath).extract({ left, top, width, height })
    if (rect.targetWidth && rect.targetWidth > 0 && rect.targetWidth < width) {
      pipeline = pipeline.resize({ width: Math.round(rect.targetWidth) })
    }
    const info = await pipeline.webp({ quality: 82 }).toFile(join(this.uploadDir, filename))

    const media = await Media.create({
      id,
      filename,
      mimeType: 'image/webp',
      size: info.size,
      url: `${this.urlPrefix}/${filename}`,
      width: info.width,
      height: info.height,
      authorId,
      origin: 'crop',
      sourceMediaId: source.id,
      title: normalizeText(meta?.title),
      alt: normalizeText(meta?.alt),
    })
    await this.generateVariants(media, join(this.uploadDir, filename))
    await media.load('variants')
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

  /** Permanently delete a trashed media row and its files (original + variants). */
  async forceDelete(id: string): Promise<void> {
    const media = await Media.query()
      .where('id', id)
      .whereNotNull('deleted_at')
      .preload('variants')
      .firstOrFail()
    const filePath = join(this.uploadDir, media.filename)
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true })
    }
    for (const v of media.variants ?? []) {
      const name = v.url.split('/').pop()
      const p = name ? this.resolveFilePath(name) : null
      if (p) rmSync(p, { force: true })
    }
    await media.delete() // media_variants rows cascade via FK
  }

  async serve(response: HttpContext['response'], path: string, media: Media) {
    const inline = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    response.header('X-Content-Type-Options', 'nosniff')
    response.header('Content-Security-Policy', "default-src 'none'; sandbox")
    response.header('Content-Type', media.mimeType)
    response.header(
      'Content-Disposition',
      `${inline.has(media.mimeType) ? 'inline' : 'attachment'}; filename=\"${media.filename}\"`
    )
    if (media.mimeType === 'image/svg+xml') {
      const safe = sanitizeSvg(await readFile(path, 'utf8'))
      if (!safe) return response.notFound({ message: 'Not found' })
      return response.send(safe)
    }
    return response.send(await readFile(path))
  }

  private toDto(media: Media): MediaDto {
    let variants: MediaVariantDto[] = []
    try {
      const vs = media.variants
      if (Array.isArray(vs)) {
        variants = vs
          .map((v) => ({ width: v.width, height: v.height, format: v.format, url: v.url }))
          .sort((a, b) => a.width - b.width)
      }
    } catch {
      // Relation not preloaded on this path; treat as no variants.
    }
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
      origin: media.origin ?? 'upload',
      sourceUrl: media.sourceUrl ?? null,
      sourceMediaId: media.sourceMediaId ?? null,
      variants,
      createdAt: media.createdAt.toISO()!,
      updatedAt: media.updatedAt?.toISO() ?? null,
    }
  }
}
