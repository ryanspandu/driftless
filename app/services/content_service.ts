import Content from '#models/content'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'

export interface ContentDto {
  id: string
  title: string
  slug: string
  body: string
  status: 'DRAFT' | 'PUBLISHED'
  authorId: number | null
  createdAt: string
  updatedAt: string
}

export interface PublicContentDto {
  id: string
  title: string
  slug: string
  body: string
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
    return this.toPublicDto(row)
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
    dto: { title: string; slug: string; body: string; status: string }
  ): Promise<ContentDto> {
    const existing = await Content.query().where('slug', dto.slug).whereNull('deleted_at').first()
    if (existing) throw new Error('Slug already in use')

    const row = await Content.create({
      id: newUlid(),
      title: dto.title,
      slug: dto.slug,
      body: dto.body,
      status: dto.status as 'DRAFT' | 'PUBLISHED',
      authorId,
    })
    return this.toDto(row)
  }

  async update(
    id: string,
    dto: { title?: string; slug?: string; body?: string; status?: string }
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
    if (dto.body !== undefined) row.body = dto.body
    if (dto.status !== undefined) row.status = dto.status as 'DRAFT' | 'PUBLISHED'
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
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}
