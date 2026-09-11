import Content from '#models/content'
import type { CmsRecordDto } from '#services/cms_service'
import {
  excerptOf,
  pageOf,
  registerBuiltinCollection,
  shapeBuiltinQuery,
  type BuiltinCollection,
  type BuiltinRecordQuery,
} from '#cms/builtin_collections'

/**
 * Blog posts (the Content admin page, table `contents`) as a bindable
 * collection.
 *
 * Only PUBLISHED, non-deleted posts are ever returned: this feeds public pages.
 * `excerpt` and `url` are derived so a card can be built from bindings alone
 * — no template needs to know the public route or strip HTML itself.
 */

export const POSTS_COLLECTION_KEY = 'posts'
export const POST_PATH_PREFIX = '/posts'

const COLUMNS: Record<string, string> = {
  title: 'title',
  slug: 'slug',
  body: 'body',
}

function toRecord(row: Content): CmsRecordDto {
  const slug = row.slug
  /**
   * Withhold protected content from this listing surface.
   *
   * A PROTECTED / MEMBER post's body and custom fields are gated behind an
   * unlock on the canonical route (`content_service.findPublishedBySlug` blanks
   * `body` and nulls `data` until the viewer unlocks). This adapter feeds the
   * public records API, the SSR collection preload and the builder's per-record
   * binding — all anonymous, with no per-viewer unlock — so a non-public post
   * must expose only its public shell here (title / slug / url / author /
   * featured image), never its body, excerpt or custom-field `data`. Without
   * this, a Collection List bound to `posts` (e.g. a Rich Text bound to `body`,
   * or even the built-in card's excerpt) would leak gated content to everyone.
   */
  const isPublic = (row.visibility ?? 'PUBLIC') === 'PUBLIC'
  const body = isPublic ? row.body : ''
  return {
    id: row.id,
    status: 'PUBLISHED',
    authorId: row.authorId === null || row.authorId === undefined ? null : String(row.authorId),
    data: {
      // Custom fields (Content-type collection) first, so the built-in keys
      // below always win on any name clash. Withheld entirely for a non-public
      // post (mirrors `content_service` nulling `data` behind the gate).
      ...(isPublic ? (row.data ?? {}) : {}),
      title: row.title,
      slug,
      // Derived from the (possibly withheld) body, so a gated post yields an
      // empty excerpt rather than a plaintext preview of its protected content.
      excerpt: excerptOf(body),
      body,
      featuredImage: row.featuredImage ?? null,
      url: `${POST_PATH_PREFIX}/${encodeURIComponent(slug)}`,
      author: row.author?.fullName ?? null,
      publishedAt: row.createdAt.toISO(),
      // Exposed so a card/template can show a lock badge, matching the built-in
      // archive DTO.
      visibility: row.visibility ?? 'PUBLIC',
    },
    createdAt: row.createdAt.toISO()!,
    updatedAt: row.updatedAt.toISO()!,
  }
}

function base() {
  return Content.query().where('status', 'PUBLISHED').whereNull('deleted_at').preload('author')
}

/**
 * Restrict a posts query to a category / tag by slug via the pivot tables — the
 * archive-override filter. A `whereExists` join (same shape as the storefront
 * tag filter), applied to BOTH the list and the count query so `total` matches.
 */
function applyTaxonomy(
  q: ReturnType<typeof base>,
  categorySlug?: string,
  tagSlug?: string
): ReturnType<typeof base> {
  if (categorySlug) {
    q.whereExists((sub) => {
      sub
        .from('content_post_category')
        .join('content_categories', 'content_categories.id', 'content_post_category.category_id')
        .whereRaw('content_post_category.content_id = contents.id')
        .where('content_categories.slug', categorySlug)
        .whereNull('content_categories.deleted_at')
    })
  }
  if (tagSlug) {
    q.whereExists((sub) => {
      sub
        .from('content_post_tag')
        .join('content_tags', 'content_tags.id', 'content_post_tag.tag_id')
        .whereRaw('content_post_tag.content_id = contents.id')
        .where('content_tags.slug', tagSlug)
        .whereNull('content_tags.deleted_at')
    })
  }
  return q
}

export const postsCollection: BuiltinCollection = {
  key: POSTS_COLLECTION_KEY,
  label: 'Posts',
  icon: 'Article',
  group: 'Content',
  fields: [
    { key: 'title', label: 'Title', type: 'TEXT' },
    { key: 'excerpt', label: 'Excerpt', type: 'TEXTAREA' },
    { key: 'body', label: 'Body', type: 'RICHTEXT' },
    { key: 'slug', label: 'Slug', type: 'SLUG' },
    { key: 'url', label: 'Post URL', type: 'TEXT' },
    { key: 'author', label: 'Author', type: 'TEXT' },
    { key: 'publishedAt', label: 'Published at', type: 'DATETIME' },
  ],

  async list(query: BuiltinRecordQuery) {
    const q = base()
    const { page, pageSize, offset } = shapeBuiltinQuery(q, query, {
      columns: COLUMNS,
      searchColumns: ['title', 'body'],
      defaultSort: { column: 'created_at', dir: 'desc' },
    })
    // Archive-override taxonomy filter (category/tag by slug). Applied to the
    // list query and, identically, to the count so pagination stays correct.
    applyTaxonomy(q, query.categorySlug, query.tagSlug)
    const countQuery = Content.query().where('status', 'PUBLISHED').whereNull('deleted_at')
    applyTaxonomy(countQuery, query.categorySlug, query.tagSlug)
    const countRow = await countQuery.count('* as total')
    const total = Number((countRow[0] as any)?.$extras?.total ?? 0)
    const rows = await q.limit(pageSize).offset(offset)
    return pageOf(rows.map(toRecord), total, page, pageSize)
  },

  async find(id: string) {
    const row = await base().where('id', id).first()
    return row ? toRecord(row) : null
  },
}

export function registerPostsCollection(): void {
  registerBuiltinCollection(postsCollection)
}
