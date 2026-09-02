import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CmsService from '#services/cms_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function seedArticles() {
  const cms = new CmsService()
  await cms.createCollection({
    key: 'articles',
    label: 'Articles',
    fields: [
      { key: 'title', label: 'Title', type: 'TEXT' },
      { key: 'tag', label: 'Tag', type: 'TEXT' },
    ],
  })
  const rows = [
    { title: 'Alpha', tag: 'news' },
    { title: 'Bravo', tag: 'blog' },
    { title: 'Charlie', tag: 'blog' },
    { title: 'Delta', tag: 'news' },
  ]
  for (const data of rows) {
    await cms.createRecord('articles', 1, { data, status: 'PUBLISHED' })
  }
  return cms
}

test.group('CollectionList | server-side query', (group) => {
  group.each.setup(async () => resetDatabase())

  test('filters by a field (case-insensitive substring)', async ({ assert }) => {
    const cms = await seedArticles()
    const res = await cms.listRecords('articles', {
      status: 'PUBLISHED',
      filterField: 'tag',
      filterValue: 'BLOG',
    })
    assert.equal(res.items.length, 2)
    assert.deepEqual(res.items.map((r) => r.data.title).sort(), ['Bravo', 'Charlie'])
  })

  test('sorts by a whitelisted field ascending', async ({ assert }) => {
    const cms = await seedArticles()
    const res = await cms.listRecords('articles', {
      status: 'PUBLISHED',
      sortField: 'title',
      sortDir: 'asc',
    })
    assert.deepEqual(
      res.items.map((r) => r.data.title),
      ['Alpha', 'Bravo', 'Charlie', 'Delta']
    )
  })

  test('paginates with page + pageSize', async ({ assert }) => {
    const cms = await seedArticles()
    const p1 = await cms.listRecords('articles', {
      status: 'PUBLISHED',
      sortField: 'title',
      sortDir: 'asc',
      pageSize: 2,
      page: 1,
    })
    const p2 = await cms.listRecords('articles', {
      status: 'PUBLISHED',
      sortField: 'title',
      sortDir: 'asc',
      pageSize: 2,
      page: 2,
    })
    assert.deepEqual(
      p1.items.map((r) => r.data.title),
      ['Alpha', 'Bravo']
    )
    assert.deepEqual(
      p2.items.map((r) => r.data.title),
      ['Charlie', 'Delta']
    )
    assert.equal(p1.total, 4)
    assert.equal(p1.totalPages, 2)
  })

  test('ignores an unknown filter field rather than erroring', async ({ assert }) => {
    const cms = await seedArticles()
    const res = await cms.listRecords('articles', {
      status: 'PUBLISHED',
      filterField: 'not_a_field',
      filterValue: 'x',
    })
    // No filter applied → all rows.
    assert.equal(res.items.length, 4)
  })

  test('the public endpoint accepts the shaping params', async ({ client, assert }) => {
    await seedArticles()
    const res = await client.get(
      '/api/public/cms/articles/records?filterField=tag&filterValue=blog&sortField=title&sortDir=asc'
    )
    res.assertStatus(200)
    assert.deepEqual(
      res.body().items.map((r: { data: { title: string } }) => r.data.title),
      ['Bravo', 'Charlie']
    )
  })
})
