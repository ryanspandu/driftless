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
  return {
    id: row.id,
    status: 'PUBLISHED',
    authorId: row.authorId === null || row.authorId === undefined ? null : String(row.authorId),
    data: {
      title: row.title,
      slug,
      excerpt: excerptOf(row.body),
      body: row.body,
      url: `${POST_PATH_PREFIX}/${encodeURIComponent(slug)}`,
      author: row.author?.fullName ?? null,
      publishedAt: row.createdAt.toISO(),
    },
    createdAt: row.createdAt.toISO()!,
    updatedAt: row.updatedAt.toISO()!,
  }
}

function base() {
  return Content.query().where('status', 'PUBLISHED').whereNull('deleted_at').preload('author')
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
    const countRow = await Content.query()
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .count('* as total')
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
