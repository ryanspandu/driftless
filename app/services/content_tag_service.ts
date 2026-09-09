import ContentTag from '#models/content_tag'
import Content from '#models/content'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export interface ContentTagDto {
  id: string
  name: string
  slug: string
  description: string | null
  position: number
  /** How many posts are assigned to this tag. */
  postCount: number
}

/** Compact shape embedded on a post (editor + public). */
export interface ContentTagRef {
  id: string
  name: string
  slug: string
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export default class ContentTagService {
  async list(): Promise<ContentTagDto[]> {
    const rows = await ContentTag.query()
      .whereNull('deleted_at')
      .orderBy('position')
      .orderBy('name')
    const counts = await db
      .from('content_post_tag')
      .select('tag_id')
      .count('* as total')
      .groupBy('tag_id')
    const countMap = new Map(
      (counts as Array<{ tag_id: string; total: number | string }>).map((c) => [
        String(c.tag_id),
        Number(c.total),
      ])
    )
    return rows.map((r) => ({ ...this.toDto(r), postCount: countMap.get(r.id) ?? 0 }))
  }

  async create(dto: {
    name: string
    slug?: string
    description?: string | null
  }): Promise<ContentTagDto> {
    const name = String(dto.name ?? '').trim()
    if (!name) throw new Error('Name is required')
    const slug = await this.freeSlug(dto.slug?.trim() || slugify(name))
    const row = await ContentTag.create({
      id: newUlid(),
      name,
      slug,
      description: dto.description?.trim() || null,
      position: 0,
    })
    return this.toDto(row)
  }

  async update(
    id: string,
    dto: { name?: string; slug?: string; description?: string | null }
  ): Promise<ContentTagDto> {
    const row = await ContentTag.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (dto.name !== undefined) row.name = dto.name.trim()
    if (dto.slug !== undefined) row.slug = await this.freeSlug(slugify(dto.slug) || row.slug, id)
    if (dto.description !== undefined) row.description = dto.description?.trim() || null
    await row.save()
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await ContentTag.query().where('id', id).whereNull('deleted_at').firstOrFail()
    await db.from('content_post_tag').where('tag_id', id).delete()
    row.deletedAt = DateTime.now()
    await row.save()
  }

  /** Published posts assigned to a tag (by slug), most-recent first. */
  async publishedPostsInTag(slug: string): Promise<Content[]> {
    const tag = await ContentTag.query().where('slug', slug).whereNull('deleted_at').first()
    if (!tag) return []
    return Content.query()
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .whereExists((q) =>
        q
          .from('content_post_tag')
          .whereColumn('content_post_tag.content_id', 'contents.id')
          .where('content_post_tag.tag_id', tag.id)
      )
      .orderBy('updated_at', 'desc')
  }

  /** The tag (by slug) as a ref, or null. */
  async findRefBySlug(slug: string): Promise<ContentTagRef | null> {
    const tag = await ContentTag.query().where('slug', slug).whereNull('deleted_at').first()
    return tag ? { id: tag.id, name: tag.name, slug: tag.slug } : null
  }

  private async freeSlug(base: string, excludeId?: string): Promise<string> {
    const stem = base || 'tag'
    let candidate = stem
    let n = 2
    for (;;) {
      let q = ContentTag.query().where('slug', candidate).whereNull('deleted_at')
      if (excludeId) q = q.whereNot('id', excludeId)
      if (!(await q.first())) return candidate
      candidate = `${stem}-${n++}`
    }
  }

  private toDto(row: ContentTag): ContentTagDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      position: row.position,
      postCount: 0,
    }
  }
}
