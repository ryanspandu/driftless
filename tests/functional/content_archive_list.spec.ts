import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import ContentTagService from '#services/content_tag_service'
import { registerPostsCollection } from '#cms/builtin/posts_collection'
import { resolvePageCollections } from '#services/page_data_resolver'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  // The posts built-in collection is registered at boot; ensure it's present
  // for the records API + resolver under test.
  registerPostsCollection()
  return cleanup
}

async function adminId(): Promise<number> {
  const u = await User.query().where('email', 'admin@driftless.local').firstOrFail()
  return u.id
}

const content = new ContentService()

async function post(
  title: string,
  slug: string,
  opts: {
    categoryIds?: string[]
    tagIds?: string[]
    visibility?: 'PUBLIC' | 'PROTECTED' | 'MEMBER'
    password?: string
  } = {}
) {
  return content.create(await adminId(), {
    title,
    slug,
    body: `<p>body of ${slug}</p>`,
    status: 'PUBLISHED',
    visibility: opts.visibility,
    password: opts.password,
    categoryIds: opts.categoryIds,
    tagIds: opts.tagIds,
  })
}

/** A minimal Puck doc holding a CollectionList bound to `posts`. */
function postsListDoc(pageSize = 10) {
  return {
    content: [{ type: 'CollectionList', props: { source: { collectionKey: 'posts' }, pageSize } }],
  }
}

test.group('Content archive — taxonomy list', (group) => {
  group.each.setup(async () => resetDatabase())

  test('records API filters posts by category slug', async ({ client, assert }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' })
    await post('In news', 'in-news', { categoryIds: [cat.id] })
    await post('Not in news', 'plain')

    const res = await client.get('/api/public/cms/posts/records?category=news')
    res.assertStatus(200)
    const slugs = (res.body().items as Array<{ data: { slug: string } }>).map((r) => r.data.slug)
    assert.deepEqual(slugs.sort(), ['in-news'])
    assert.equal(res.body().total, 1)
  })

  test('records API filters posts by tag slug', async ({ client, assert }) => {
    const tag = await new ContentTagService().create({ name: 'Featured', slug: 'featured' })
    await post('Tagged', 'tagged', { tagIds: [tag.id] })
    await post('Untagged', 'untagged')

    const res = await client.get('/api/public/cms/posts/records?tag=featured')
    res.assertStatus(200)
    const slugs = (res.body().items as Array<{ data: { slug: string } }>).map((r) => r.data.slug)
    assert.deepEqual(slugs, ['tagged'])
  })

  test('a Protected post appears in the list with its body withheld', async ({
    client,
    assert,
  }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' })
    await post('Secret', 'secret', {
      categoryIds: [cat.id],
      visibility: 'PROTECTED',
      password: 'pw',
    })

    const res = await client.get('/api/public/cms/posts/records?category=news')
    const row = (res.body().items as Array<{ data: Record<string, unknown> }>).find(
      (r) => r.data.slug === 'secret'
    )
    assert.isDefined(row)
    assert.equal(row!.data.body, '')
    assert.equal(row!.data.excerpt, '')
    assert.equal(row!.data.visibility, 'PROTECTED')
  })

  test('SSR resolver inherits the archive route binding to filter a posts list', async ({
    assert,
  }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' })
    await post('In news', 'in-news', { categoryIds: [cat.id] })
    await post('Elsewhere', 'elsewhere')

    // Without a binding: unfiltered (both posts preload).
    const open = await resolvePageCollections([postsListDoc()])
    const openItems = Object.values(open)[0] as Array<{ data: { slug: string } }>
    assert.lengthOf(openItems, 2)

    // With the category archive binding: only the category's post, under a cache
    // key that carries the taxonomy (so the client finds the preload).
    const bound = await resolvePageCollections([postsListDoc()], {
      params: { slug: 'news', kind: 'category' },
    })
    const keys = Object.keys(bound)
    assert.isTrue(
      keys.some((k) => k.includes('|news|')),
      'cache key must include the bound category slug'
    )
    const boundItems = Object.values(bound)[0] as Array<{ data: { slug: string } }>
    assert.deepEqual(
      boundItems.map((r) => r.data.slug),
      ['in-news']
    )
  })
})
