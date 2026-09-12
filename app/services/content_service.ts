import Content from '#models/content'
import type ContentCategory from '#models/content_category'
import type ContentTag from '#models/content_tag'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import { timingSafeEqual } from 'node:crypto'
import { sanitizeRichText } from '#services/html_sanitizer_service'
import CmsService from '#services/cms_service'
import { coerceCustomData, resolvePublicCustomData } from '#cms/custom_field_resolver'
import type { ContentCategoryRef } from '#services/content_category_service'
import type { ContentTagRef } from '#services/content_tag_service'

export type ContentVisibility = 'PUBLIC' | 'PROTECTED' | 'MEMBER'

/**
 * Bound to the encryption call so a Protected-post ciphertext can never be
 * replayed into another encrypted column (mirrors gateway_credentials_service).
 */
const POST_PASSWORD_PURPOSE = 'content_post_password'

/** Length-safe constant-time string compare, so the gate leaks no timing signal. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Coerce an incoming visibility to a valid value, defaulting to PUBLIC. */
function normalizeVisibility(value: unknown): ContentVisibility {
  return value === 'PROTECTED' || value === 'MEMBER' ? value : 'PUBLIC'
}

function encryptPostPassword(password: string): string {
  return encryption.encrypt(password, undefined, POST_PASSWORD_PURPOSE)
}

export interface ContentDto {
  id: string
  title: string
  slug: string
  body: string
  status: 'DRAFT' | 'PUBLISHED'
  /** Who may read the post publicly. */
  visibility: ContentVisibility
  /** Whether a Protected password is set (never the password itself). */
  hasPassword: boolean
  /** Native featured image / thumbnail — a media URL (`/uploads/…`). */
  featuredImage: string | null
  /** Custom fields defined by the Content-type collection (raw values, for editing). */
  data: Record<string, unknown> | null
  /** Assigned content categories. */
  categories: ContentCategoryRef[]
  /** Assigned content tags. */
  tags: ContentTagRef[]
  authorId: number | null
  createdAt: string
  updatedAt: string
}

export interface PublicContentDto {
  id: string
  title: string
  slug: string
  body: string
  /** Public visibility, so the page/archives can show a lock badge. */
  visibility: ContentVisibility
  featuredImage: string | null
  /**
   * Custom fields, with RELATION ids resolved to labels and MEDIA ids to URLs
   * (single-post render only); the list keeps raw values.
   */
  data: Record<string, unknown> | null
  /** Assigned content categories (id + name + slug), for chips + links. */
  categories: ContentCategoryRef[]
  /** Assigned content tags. */
  tags: ContentTagRef[]
  createdAt: string
  updatedAt: string
}

export default class ContentService {
  async findAll(): Promise<ContentDto[]> {
    const rows = await Content.query()
      .whereNull('deleted_at')
      .preload('categories')
      .preload('tags')
      .orderBy('updated_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async findPublishedList(): Promise<PublicContentDto[]> {
    const rows = await Content.query()
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .preload('categories')
      .preload('tags')
      .orderBy('updated_at', 'desc')
    return rows.map((r) => this.toPublicDto(r))
  }

  /**
   * Paginated, optionally-searched published-post list for the public blog
   * index (`/blog?q=...`). Search is server-side (title + body LIKE) so a
   * shared/crawled search URL renders real SSR results — mirrors
   * StorefrontCatalogService.list's `search` handling for products.
   */
  async listPublished(
    opts: { search?: string; page?: number; pageSize?: number } = {}
  ): Promise<{ items: PublicContentDto[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(opts.page ?? 1, 1)
    // Hard ceiling, same reasoning as the ecommerce storefront: an
    // unauthenticated endpoint must not be able to ask for the whole table.
    const pageSize = Math.min(Math.max(opts.pageSize ?? 12, 1), 48)

    const builder = Content.query().where('status', 'PUBLISHED').whereNull('deleted_at')

    if (opts.search?.trim()) {
      const term = `%${opts.search.trim().toLowerCase().slice(0, 100)}%`
      builder.where((q) => {
        q.whereRaw('LOWER(title) LIKE ?', [term]).orWhereRaw('LOWER(body) LIKE ?', [term])
      })
    }

    const result = await builder
      .preload('categories')
      .preload('tags')
      .orderBy('updated_at', 'desc')
      .paginate(page, pageSize)

    return {
      items: result.all().map((r) => this.toPublicDto(r)),
      total: result.total,
      page,
      pageSize,
    }
  }

  /**
   * A single published post for public render.
   *
   * `includeSecret` is the server-side guarantee behind the visibility gate:
   * when false (a Protected/Member post the visitor may not read yet), the body
   * and resolved custom fields are withheld so they never reach the payload —
   * only the title/slug/visibility survive, enough to render the unlock prompt.
   */
  async findPublishedBySlug(slug: string, includeSecret = true): Promise<PublicContentDto> {
    const row = await Content.query()
      .where('slug', slug)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .preload('categories')
      .preload('tags')
      .firstOrFail()
    const dto = this.toPublicDto(row)
    if (!includeSecret) {
      dto.body = ''
      dto.data = null
      return dto
    }
    // Single-post render resolves relation ids → labels and media ids → URLs.
    dto.data = await this.resolvePublicData(row.data)
    return dto
  }

  /** The row's visibility (+ whether a password is set), without loading relations. */
  async findAccessMetaBySlug(
    slug: string
  ): Promise<{ id: string; visibility: ContentVisibility; hasPassword: boolean } | null> {
    const row = await Content.query()
      .where('slug', slug)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()
    if (!row) return null
    return { id: row.id, visibility: row.visibility, hasPassword: !!row.passwordEnc }
  }

  /** Verify a submitted password against the stored (encrypted) Protected password. */
  async verifyPostPassword(slug: string, password: string): Promise<boolean> {
    const row = await Content.query()
      .where('slug', slug)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()
    if (!row || row.visibility !== 'PROTECTED' || !row.passwordEnc) return false
    const stored = encryption.decrypt<string>(row.passwordEnc, POST_PASSWORD_PURPOSE)
    if (typeof stored !== 'string') return false
    return safeEqual(stored, password)
  }

  /** Admin-only: reveal the decrypted Protected password (for the editor's Reveal button). */
  async revealPassword(id: string): Promise<string | null> {
    const row = await Content.query().where('id', id).whereNull('deleted_at').first()
    if (!row || !row.passwordEnc) return null
    const stored = encryption.decrypt<string>(row.passwordEnc, POST_PASSWORD_PURPOSE)
    return typeof stored === 'string' ? stored : null
  }

  async findOne(id: string): Promise<ContentDto> {
    const row = await Content.query()
      .where('id', id)
      .whereNull('deleted_at')
      .preload('categories')
      .preload('tags')
      .firstOrFail()
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
      visibility?: string
      password?: string | null
      featuredImage?: string | null
      data?: Record<string, unknown> | null
      categoryIds?: string[]
      tagIds?: string[]
    }
  ): Promise<ContentDto> {
    const existing = await Content.query().where('slug', dto.slug).whereNull('deleted_at').first()
    if (existing) throw new Error('Slug already in use')

    const visibility = normalizeVisibility(dto.visibility)
    if (visibility === 'PROTECTED' && !dto.password) {
      throw new Error('A protected post needs a password.')
    }
    const row = await Content.create({
      id: newUlid(),
      title: dto.title,
      slug: dto.slug,
      body: sanitizeRichText(dto.body),
      status: dto.status as 'DRAFT' | 'PUBLISHED',
      visibility,
      // Only a PROTECTED post carries a password; other modes never store one.
      passwordEnc:
        visibility === 'PROTECTED' && dto.password ? encryptPostPassword(dto.password) : null,
      featuredImage: dto.featuredImage ?? null,
      data: await this.prepareData(dto.data),
      authorId,
    })
    if (dto.categoryIds) await row.related('categories').sync(dto.categoryIds)
    if (dto.tagIds) await row.related('tags').sync(dto.tagIds)
    await row.load('categories')
    await row.load('tags')
    return this.toDto(row)
  }

  async update(
    id: string,
    dto: {
      title?: string
      slug?: string
      body?: string
      status?: string
      visibility?: string
      password?: string | null
      featuredImage?: string | null
      data?: Record<string, unknown> | null
      categoryIds?: string[]
      tagIds?: string[]
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
    if (dto.visibility !== undefined) row.visibility = normalizeVisibility(dto.visibility)
    // Password rules: a non-empty value (re)sets it; leaving the post non-PROTECTED
    // clears it so a stale password can never gate a later Public/Member post.
    if (dto.password !== undefined && dto.password !== null && dto.password !== '') {
      row.passwordEnc = encryptPostPassword(dto.password)
    }
    if (row.visibility !== 'PROTECTED') row.passwordEnc = null
    if (row.visibility === 'PROTECTED' && !row.passwordEnc) {
      throw new Error('A protected post needs a password.')
    }
    if (dto.featuredImage !== undefined) row.featuredImage = dto.featuredImage ?? null
    if (dto.data !== undefined) row.data = await this.prepareData(dto.data)
    await row.save()
    if (dto.categoryIds !== undefined) await row.related('categories').sync(dto.categoryIds)
    if (dto.tagIds !== undefined) await row.related('tags').sync(dto.tagIds)
    await row.load('categories')
    await row.load('tags')
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

  /** Preloaded categories → refs (empty when the relation isn't loaded). */
  private catRefs(row: Content): ContentCategoryRef[] {
    const cats = (row.categories ?? []) as ContentCategory[]
    return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
  }

  /** Preloaded tags → refs (empty when the relation isn't loaded). */
  private tagRefs(row: Content): ContentTagRef[] {
    const tags = (row.tags ?? []) as ContentTag[]
    return tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
  }

  private toDto(row: Content): ContentDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      body: row.body,
      status: row.status,
      visibility: row.visibility,
      hasPassword: !!row.passwordEnc,
      featuredImage: row.featuredImage ?? null,
      data: row.data ?? null,
      categories: this.catRefs(row),
      tags: this.tagRefs(row),
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
      visibility: row.visibility,
      featuredImage: row.featuredImage ?? null,
      data: row.data ?? null,
      categories: this.catRefs(row),
      tags: this.tagRefs(row),
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  /**
   * Coerce + filter an incoming custom-field payload against the Content-type
   * collection's schema. Delegates to the shared metadata-field helper so Content
   * and the ecommerce Product editor coerce custom fields identically.
   */
  private async prepareData(
    data: Record<string, unknown> | null | undefined
  ): Promise<Record<string, unknown> | null> {
    const collection = await new CmsService().contentTypeCollection()
    return coerceCustomData(collection, data)
  }

  /**
   * Public read-side resolution of a post's custom fields (RELATION ids → labels,
   * MEDIA ids → URLs), via the shared metadata-field helper — so a Content-type
   * post renders the same way a collection record would.
   */
  private async resolvePublicData(
    data: Record<string, unknown> | null
  ): Promise<Record<string, unknown> | null> {
    const cms = new CmsService()
    const collection = await cms.contentTypeCollection()
    return resolvePublicCustomData(cms, collection, data)
  }
}
