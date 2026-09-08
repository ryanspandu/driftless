import Content from '#models/content'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'
import { sanitizeRichText } from '#services/html_sanitizer_service'
import CmsService, { type CmsRecordDto } from '#services/cms_service'
import { coerceFieldValue, recordLabel } from '#cms/field_values'

export interface ContentDto {
  id: string
  title: string
  slug: string
  body: string
  status: 'DRAFT' | 'PUBLISHED'
  /** Native featured image / thumbnail — a media URL (`/uploads/…`). */
  featuredImage: string | null
  /** Custom fields defined by the Content-type collection (raw values, for editing). */
  data: Record<string, unknown> | null
  authorId: number | null
  createdAt: string
  updatedAt: string
}

export interface PublicContentDto {
  id: string
  title: string
  slug: string
  body: string
  featuredImage: string | null
  /**
   * Custom fields, with RELATION ids resolved to labels and MEDIA ids to URLs
   * (single-post render only); the list keeps raw values.
   */
  data: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export default class ContentService {
  async findAll(): Promise<ContentDto[]> {
    const rows = await Content.query().whereNull('deleted_at').orderBy('updated_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async findPublishedList(): Promise<PublicContentDto[]> {
    const rows = await Content.query()
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .orderBy('updated_at', 'desc')
    return rows.map((r) => this.toPublicDto(r))
  }

  async findPublishedBySlug(slug: string): Promise<PublicContentDto> {
    const row = await Content.query()
      .where('slug', slug)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .firstOrFail()
    const dto = this.toPublicDto(row)
    // Single-post render resolves relation ids → labels and media ids → URLs.
    dto.data = await this.resolvePublicData(row.data)
    return dto
  }

  async findOne(id: string): Promise<ContentDto> {
    const row = await Content.query().where('id', id).whereNull('deleted_at').firstOrFail()
    return this.toDto(row)
  }

  /** True when `slug` is free (ignoring soft-deleted rows and, on edit, `excludeId`). */
  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const trimmed = slug.trim()
    if (!trimmed) return false
    const query = Content.query().where('slug', trimmed).whereNull('deleted_at')
    if (excludeId) query.whereNot('id', excludeId)
    const existing = await query.first()
    return !existing
  }

  async create(
    authorId: number,
    dto: {
      title: string
      slug: string
      body: string
      status: string
      featuredImage?: string | null
      data?: Record<string, unknown> | null
    }
  ): Promise<ContentDto> {
    const existing = await Content.query().where('slug', dto.slug).whereNull('deleted_at').first()
    if (existing) throw new Error('Slug already in use')

    const row = await Content.create({
      id: newUlid(),
      title: dto.title,
      slug: dto.slug,
      body: sanitizeRichText(dto.body),
      status: dto.status as 'DRAFT' | 'PUBLISHED',
      featuredImage: dto.featuredImage ?? null,
      data: await this.prepareData(dto.data),
      authorId,
    })
    return this.toDto(row)
  }

  async update(
    id: string,
    dto: {
      title?: string
      slug?: string
      body?: string
      status?: string
      featuredImage?: string | null
      data?: Record<string, unknown> | null
    }
  ): Promise<ContentDto> {
    const row = await Content.query().where('id', id).whereNull('deleted_at').firstOrFail()

    if (dto.slug && dto.slug !== row.slug) {
      const existing = await Content.query()
        .where('slug', dto.slug)
        .whereNull('deleted_at')
        .whereNot('id', id)
        .first()
      if (existing) throw new Error('Slug already in use')
    }

    if (dto.title !== undefined) row.title = dto.title
    if (dto.slug !== undefined) row.slug = dto.slug
    if (dto.body !== undefined) row.body = sanitizeRichText(dto.body)
    if (dto.status !== undefined) row.status = dto.status as 'DRAFT' | 'PUBLISHED'
    if (dto.featuredImage !== undefined) row.featuredImage = dto.featuredImage ?? null
    if (dto.data !== undefined) row.data = await this.prepareData(dto.data)
    await row.save()
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await Content.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.deletedAt = DateTime.now()
    row.slug = `__deleted_${id}__${row.slug}`
    await row.save()
  }

  /** Soft-deleted rows (the Trash). Slug is restored to its display form. */
  async findTrashed(): Promise<ContentDto[]> {
    const rows = await Content.query().whereNotNull('deleted_at').orderBy('updated_at', 'desc')
    return rows.map((r) => {
      const dto = this.toDto(r)
      dto.slug = this.stripDeletedPrefix(r.id, dto.slug)
      return dto
    })
  }

  /** Restore a soft-deleted row, recovering its original slug (suffixed if it now clashes). */
  async restore(id: string): Promise<ContentDto> {
    const row = await Content.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    const cleanSlug = this.stripDeletedPrefix(id, row.slug)
    const clash = await Content.query()
      .where('slug', cleanSlug)
      .whereNull('deleted_at')
      .whereNot('id', id)
      .first()
    row.slug = clash ? `${cleanSlug}-restored-${id.slice(-6)}` : cleanSlug
    row.deletedAt = null
    await row.save()
    return this.toDto(row)
  }

  /** Permanently delete a row that is already in the Trash. */
  async forceDelete(id: string): Promise<void> {
    const row = await Content.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    await row.delete()
  }

  private stripDeletedPrefix(id: string, value: string): string {
    const prefix = `__deleted_${id}__`
    return value.startsWith(prefix) ? value.slice(prefix.length) : value
  }

  private toDto(row: Content): ContentDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      body: row.body,
      status: row.status,
      featuredImage: row.featuredImage ?? null,
      data: row.data ?? null,
      authorId: row.authorId,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  private toPublicDto(row: Content): PublicContentDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      body: row.body,
      featuredImage: row.featuredImage ?? null,
      data: row.data ?? null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  /**
   * Coerce + filter an incoming custom-field payload against the Content-type
   * collection's schema: unknown keys are dropped, each value is coerced by its
   * field type (reusing the CMS field-value logic). Returns null when there is
   * no Content-type collection or nothing survives.
   */
  private async prepareData(
    data: Record<string, unknown> | null | undefined
  ): Promise<Record<string, unknown> | null> {
    if (data === null || typeof data !== 'object') return null
    const collection = await new CmsService().contentTypeCollection()
    if (!collection || collection.fields.length === 0) return null
    const out: Record<string, unknown> = {}
    for (const field of collection.fields) {
      if (!(field.key in data)) continue
      out[field.key] = coerceFieldValue(field, (data as Record<string, unknown>)[field.key])
    }
    return Object.keys(out).length ? out : null
  }

  /**
   * Public read-side resolution of a post's custom fields: RELATION ids become
   * their target records' labels (single → a label, multi → an array of
   * labels), MEDIA ids become their public URLs. Mirrors the CMS record
   * resolution so a Content-type post renders the same way a collection record
   * would. Missing/deleted targets degrade to blank rather than erroring.
   */
  private async resolvePublicData(
    data: Record<string, unknown> | null
  ): Promise<Record<string, unknown> | null> {
    if (!data) return null
    const cms = new CmsService()
    const collection = await cms.contentTypeCollection()
    if (!collection) return data
    const out: Record<string, unknown> = { ...data }

    // RELATION ids → labels, batched per target collection.
    const relFields = collection.fields.filter((f) => f.type === 'RELATION')
    const idsByTarget = new Map<string, Set<string>>()
    for (const f of relFields) {
      const targetKey = typeof f.config?.targetKey === 'string' ? f.config.targetKey : ''
      if (!targetKey) continue
      const v = out[f.key]
      const bucket = idsByTarget.get(targetKey) ?? new Set<string>()
      if (typeof v === 'string' && v) bucket.add(v)
      else if (Array.isArray(v))
        for (const id of v) if (typeof id === 'string' && id) bucket.add(id)
      if (bucket.size) idsByTarget.set(targetKey, bucket)
    }
    const byTarget = new Map<string, Map<string, CmsRecordDto>>()
    for (const [targetKey, ids] of idsByTarget) {
      try {
        byTarget.set(targetKey, await cms.recordsByIds(targetKey, [...ids]))
      } catch {
        byTarget.set(targetKey, new Map())
      }
    }
    for (const f of relFields) {
      const targetKey = typeof f.config?.targetKey === 'string' ? f.config.targetKey : ''
      const byId = (targetKey && byTarget.get(targetKey)) || new Map<string, CmsRecordDto>()
      const v = out[f.key]
      if (Array.isArray(v)) {
        out[f.key] = v
          .map((id) => (typeof id === 'string' ? byId.get(id) : undefined))
          .filter((r): r is CmsRecordDto => !!r)
          .map((r) => recordLabel(r))
      } else if (typeof v === 'string' && v) {
        const target = byId.get(v)
        out[f.key] = target ? recordLabel(target) : ''
      } else {
        out[f.key] = ''
      }
    }

    // MEDIA ids → public URLs (a value that is already a URL is left as-is).
    const mediaFields = collection.fields.filter((f) => f.type === 'MEDIA')
    if (mediaFields.length) {
      const { default: MediaService } = await import('#services/media_service')
      const media = new MediaService()
      const isUrl = (s: string) => /^(https?:)?\/\//.test(s) || s.startsWith('/')
      for (const f of mediaFields) {
        const v = out[f.key]
        if (typeof v === 'string' && v && !isUrl(v)) {
          try {
            const dto = await media.findOne(v)
            if (dto?.url) out[f.key] = dto.url
          } catch {
            // Unknown/deleted media id — leave the stored value untouched.
          }
        }
      }
    }

    return out
  }
}
