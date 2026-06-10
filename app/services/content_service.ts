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

  async create(authorId: number, dto: { title: string; slug: string; body: string; status: string }): Promise<ContentDto> {
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
