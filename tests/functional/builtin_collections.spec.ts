import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Content from '#models/content'
import CmsService from '#services/cms_service'
import { newUlid } from '#services/ulid_service'
import {
  builtinCollection,
  excerptOf,
  listBuiltinCollections,
  registerBuiltinCollection,
  unregisterBuiltinCollection,
  type BuiltinCollection,
} from '#cms/builtin_collections'
import { registerPostsCollection } from '#cms/builtin/posts_collection'

/**
 * Built-in collections: posts (core) and anything a module registers appear
 * to the page builder as bindable collections, answered by their own adapter.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const cms = new CmsService()

function fakeCollection(overrides: Partial<BuiltinCollection> = {}): BuiltinCollection {
  return {
    key: 'fixture',
    label: 'Fixture',
    group: 'Test',
    fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    async list(q) {
      return { items: [], page: q.page, pageSize: q.pageSize, total: 0, totalPages: 0 }
    },
    async find() {
      return null
    },
    ...overrides,
  }
}

async function post(title: string, status: 'DRAFT' | 'PUBLISHED', body = '<p>Body</p>') {
  return Content.create({
    id: newUlid(),
    title,
    slug: title.toLowerCase().replace(/\s+/g, '-'),
    body,
    status,
  })
}

test.group('Built-in collections', (group) => {
  group.setup(() => registerPostsCollection())
  group.each.setup(async () => resetDatabase())
  group.each.teardown(() => unregisterBuiltinCollection('fixture'))

  test('posts appear in the bindable list but not in the CMS admin list', async ({ assert }) => {
    const bindable = await cms.listBindableCollections()
    const posts = bindable.find((c) => c.key === 'posts')
    assert.isDefined(posts)
    assert.equal(posts!.source, 'BUILTIN')
    assert.equal(posts!.group, 'Content')
    assert.includeMembers(
      posts!.fields.map((f) => f.key),
      ['title', 'excerpt', 'url']
    )

    const adminList = await cms.listCollections()
    assert.isUndefined(adminList.find((c) => c.key === 'posts'))
  })

  test('only published posts are listed, with derived excerpt and url', async ({ assert }) => {
    await post('Hello World', 'PUBLISHED', '<h2>Intro</h2><p>Some &amp; text</p>')
    await post('Secret Draft', 'DRAFT')

    const page = await cms.listRecords('posts', { status: 'PUBLISHED', pageSize: 12 })
    assert.equal(page.total, 1)
    assert.equal(page.items[0]!.data.title, 'Hello World')
    assert.equal(page.items[0]!.data.excerpt, 'Intro Some & text')
    assert.equal(page.items[0]!.data.url, '/posts/hello-world')

    // An admin listing drafts finds nothing here: built-ins are publish-only.
    const drafts = await cms.listRecords('posts', { status: 'DRAFT' })
    assert.equal(drafts.total, 0)
  })

  test('filter, search and sort are whitelisted to declared fields', async ({ assert }) => {
    await post('Alpha post', 'PUBLISHED')
    await post('Beta post', 'PUBLISHED')
    await post('Gamma note', 'PUBLISHED')

    const filtered = await cms.listRecords('posts', { filterField: 'title', filterValue: 'post' })
    assert.equal(filtered.total, 3) // total is unfiltered count of published rows
    assert.deepEqual(filtered.items.map((r) => r.data.title).sort(), ['Alpha post', 'Beta post'])

    const sorted = await cms.listRecords('posts', { sortField: 'title', sortDir: 'asc' })
    assert.equal(sorted.items[0]!.data.title, 'Alpha post')

    // An unknown sort/filter key is ignored rather than interpolated.
    const bogus = await cms.listRecords('posts', {
      sortField: 'id"; DROP TABLE contents; --',
      filterField: 'nope',
      filterValue: 'x',
    })
    assert.equal(bogus.items.length, 3)
  })

  test('the public records API serves posts like any collection', async ({ client, assert }) => {
    await post('Public post', 'PUBLISHED')
    await post('Hidden draft', 'DRAFT')

    const res = await client.get('/api/public/cms/posts/records?limit=12&page=1')
    res.assertStatus(200)
    assert.equal(res.body().total, 1)
    assert.equal(res.body().items[0].data.title, 'Public post')

    const one = await client.get(`/api/public/cms/posts/records/${res.body().items[0].id}`)
    one.assertStatus(200)
  })

  test('a registered adapter is routed to, and an unavailable one vanishes', async ({
    assert,
    client,
  }) => {
    let available = true
    registerBuiltinCollection(
      fakeCollection({
        available: async () => available,
        async list(q) {
          return {
            items: [
              {
                id: 'x1',
                status: 'PUBLISHED',
                authorId: null,
                data: { title: 'From adapter' },
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            page: q.page,
            pageSize: q.pageSize,
            total: 1,
            totalPages: 1,
          }
        },
      })
    )

    const listed = await cms.listRecords('fixture', { status: 'PUBLISHED' })
    assert.equal(listed.items[0]!.data.title, 'From adapter')
    const before = await listBuiltinCollections()
    assert.isDefined(before.find((c) => c.key === 'fixture'))

    // Module switched off: gone from pickers, records 404 — no restart needed.
    available = false
    assert.isNull(await builtinCollection('fixture'))
    const after = await listBuiltinCollections()
    assert.isUndefined(after.find((c) => c.key === 'fixture'))
    const res = await client.get('/api/public/cms/fixture/records')
    res.assertStatus(404)
  })

  test('a dynamic collection cannot take a built-in key', async ({ assert }) => {
    await assert.rejects(
      () => cms.createCollection({ key: 'posts', label: 'Posts clone', fields: [] } as any),
      /built-in/
    )
  })

  test('excerptOf strips markup and cuts on a word boundary', ({ assert }) => {
    assert.equal(excerptOf('<p>Hello <b>there</b>&nbsp;friend</p>'), 'Hello there friend')
    const long = excerptOf(`<p>${'word '.repeat(60)}</p>`, 40)
    assert.isTrue(long.endsWith('…'))
    assert.isTrue(long.length <= 41)
  })
})
