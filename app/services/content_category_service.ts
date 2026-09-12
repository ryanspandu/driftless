import ContentCategory from '#models/content_category'
import Content from '#models/content'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export interface ContentCategoryDto {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  position: number
  /** How many posts are assigned to this category. */
  postCount: number
}

/** Compact shape embedded on a post (editor + public). */
export interface ContentCategoryRef {
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

export default class ContentCategoryService {
  async list(): Promise<ContentCategoryDto[]> {
    const rows = await ContentCategory.query()
      .whereNull('deleted_at')
      .orderBy('position')
      .orderBy('name')
    const counts = await db
      .from('content_post_category')
      .select('category_id')
      .count('* as total')
      .groupBy('category_id')
    const countMap = new Map(
      (counts as Array<{ category_id: string; total: number | string }>).map((c) => [
        String(c.category_id),
        Number(c.total),
      ])
    )
    return rows.map((r) => ({ ...this.toDto(r), postCount: countMap.get(r.id) ?? 0 }))
  }

  async create(dto: {
    name: string
    slug?: string
    description?: string | null
    parentId?: string | null
  }): Promise<ContentCategoryDto> {
    const name = String(dto.name ?? '').trim()
    if (!name) throw new Error('Name is required')
    const slug = await this.freeSlug(dto.slug?.trim() || slugify(name))
    const row = await ContentCategory.create({
      id: newUlid(),
      name,
      slug,
      description: dto.description?.trim() || null,
      parentId: dto.parentId || null,
      position: 0,
    })
    return this.toDto(row)
  }

  async update(
    id: string,
    dto: { name?: string; slug?: string; description?: string | null; parentId?: string | null }
  ): Promise<ContentCategoryDto> {
    const row = await ContentCategory.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (dto.name !== undefined) row.name = dto.name.trim()
    if (dto.slug !== undefined) row.slug = await this.freeSlug(slugify(dto.slug) || row.slug, id)
    if (dto.description !== undefined) row.description = dto.description?.trim() || null
    if (dto.parentId !== undefined) {
      // A category can't be its own parent (a fuller cycle check is overkill here).
      row.parentId = dto.parentId && dto.parentId !== id ? dto.parentId : null
    }
    await row.save()
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await ContentCategory.query().where('id', id).whereNull('deleted_at').firstOrFail()
    // Orphan children (don't cascade-delete a subtree) and detach from posts.
    await ContentCategory.query().where('parent_id', id).update({ parent_id: null })
    await db.from('content_post_category').where('category_id', id).delete()
    row.deletedAt = DateTime.now()
    await row.save()
  }

  /**
   * Published posts assigned to a category (by slug), most-recent first.
   * `search` filters by title/body (LIKE, server-side) so `?q=` on the archive
   * page returns real SSR results — same pattern as the ecommerce storefront.
   */
  async publishedPostsInCategory(slug: string, search?: string): Promise<Content[]> {
    const cat = await ContentCategory.query().where('slug', slug).whereNull('deleted_at').first()
    if (!cat) return []
    const builder = Content.query()
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .whereExists((q) =>
        q
          .from('content_post_category')
          .whereColumn('content_post_category.content_id', 'contents.id')
          .where('content_post_category.category_id', cat.id)
      )
    if (search?.trim()) {
      const term = `%${search.trim().toLowerCase().slice(0, 100)}%`
      builder.where((q) => {
        q.whereRaw('LOWER(title) LIKE ?', [term]).orWhereRaw('LOWER(body) LIKE ?', [term])
      })
    }
    return builder.orderBy('updated_at', 'desc')
  }

  /** The category (by slug) as a ref, or null. */
  async findRefBySlug(slug: string): Promise<ContentCategoryRef | null> {
    const cat = await ContentCategory.query().where('slug', slug).whereNull('deleted_at').first()
    return cat ? { id: cat.id, name: cat.name, slug: cat.slug } : null
  }

  private async freeSlug(base: string, excludeId?: string): Promise<string> {
    const stem = base || 'category'
    let candidate = stem
    let n = 2
    for (;;) {
      let q = ContentCategory.query().where('slug', candidate).whereNull('deleted_at')
      if (excludeId) q = q.whereNot('id', excludeId)
      if (!(await q.first())) return candidate
      candidate = `${stem}-${n++}`
    }
  }

  private toDto(row: ContentCategory): ContentCategoryDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      parentId: row.parentId,
      position: row.position,
      postCount: 0,
    }
  }
}
