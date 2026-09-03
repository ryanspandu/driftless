import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import CmsService from '#services/cms_service'

/**
 * A CollectionList binding a Text/Heading to a RELATION field must show the
 * related record's LABEL (title/name/…), not its raw id — but only on the
 * public render path. The admin/editor and external v1 API keep raw ids.
 *
 * The relation schema is built once (`group.setup`) because dynamic DDL is not
 * rolled back by `truncate()`; each test only resets the records.
 */

const cms = new CmsService()

// The dynamic tables + the manyToMany join table this suite creates.
const RECORD_TABLES = ['cms_stories', 'cms_authors', 'cms_tags', 'cms_stories_tags']

async function clearRecords() {
  for (const table of RECORD_TABLES) await db.from(table).delete()
}

/** Insert Ada + tags x/y + a published story referencing them; return ids. */
async function seedRecords() {
  const ada = await cms.createRecord('authors', 1, { data: { name: 'Ada' }, status: 'PUBLISHED' })
  const tagX = await cms.createRecord('tags', 1, { data: { title: 'x' }, status: 'PUBLISHED' })
  const tagY = await cms.createRecord('tags', 1, { data: { title: 'y' }, status: 'PUBLISHED' })
  const story = await cms.createRecord('stories', 1, {
    data: { title: 'Hello', author: ada.id, tags: [tagX.id, tagY.id] },
    status: 'PUBLISHED',
  })
  return { ada, tagX, tagY, story }
}

test.group('CollectionList | relation labels', (group) => {
  group.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
    // Dynamic collections (metadata rows + physical tables) are not rolled back
    // by truncate and survive across runs, so purge this suite's collections
    // explicitly for a clean, repeatable schema build.
    const keys = ['authors', 'tags', 'stories']
    const rows = await db.from('cms_collections').whereIn('key', keys).select('id')
    const ids = rows.map((r: any) => r.id)
    if (ids.length) await db.from('cms_fields').whereIn('collection_id', ids).delete()
    await db.from('cms_collections').whereIn('key', keys).delete()
    for (const table of ['cms_stories_tags', 'cms_stories', 'cms_authors', 'cms_tags']) {
      await db.rawQuery(`DROP TABLE IF EXISTS "${table}"`)
    }
    await cms.createCollection({
      key: 'authors',
      label: 'Authors',
      fields: [{ key: 'name', label: 'Name', type: 'TEXT' }],
    })
    await cms.createCollection({
      key: 'tags',
      label: 'Tags',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.createCollection({
      key: 'stories',
      label: 'Stories',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.addField('stories', {
      key: 'author',
      label: 'Author',
      type: 'RELATION',
      config: { targetKey: 'authors', relationType: 'manyToOne' },
    })
    await cms.addField('stories', {
      key: 'tags',
      label: 'Tags',
      type: 'RELATION',
      config: { targetKey: 'tags', relationType: 'manyToMany' },
    })
  })

  group.each.setup(async () => clearRecords())

  test('public path renders relation labels, not ids', async ({ assert }) => {
    const { story } = await seedRecords()
    const res = await cms.listRecords(
      'stories',
      { status: 'PUBLISHED' },
      { resolveRelations: true }
    )
    const rec = res.items.find((r) => r.id === story.id)!
    assert.equal(rec.data.author, 'Ada')
    assert.equal(rec.data.tags, 'x, y')

    const one = await cms.findRecord('stories', story.id, { resolveRelations: true })
    assert.equal(one.data.author, 'Ada')
    assert.equal(one.data.tags, 'x, y')
  })

  test('admin path (no flag) keeps raw relation ids', async ({ assert }) => {
    const { ada, tagX, tagY, story } = await seedRecords()
    const res = await cms.listRecords('stories', { status: 'PUBLISHED' })
    const rec = res.items.find((r) => r.id === story.id)!
    assert.equal(rec.data.author, ada.id)
    assert.deepEqual((rec.data.tags as string[]).slice().sort(), [tagX.id, tagY.id].sort())
  })

  test('deleted target → blank; removed member → dropped from the join', async ({ assert }) => {
    const { ada, tagX, story } = await seedRecords()
    await cms.deleteRecord('authors', ada.id)
    await cms.deleteRecord('tags', tagX.id)
    const one = await cms.findRecord('stories', story.id, { resolveRelations: true })
    assert.equal(one.data.author, '')
    assert.equal(one.data.tags, 'y')
  })

  test('a DRAFT target still yields a label', async ({ assert }) => {
    const bob = await cms.createRecord('authors', 1, { data: { name: 'Bob' }, status: 'DRAFT' })
    const story = await cms.createRecord('stories', 1, {
      data: { title: 'Draft ref', author: bob.id, tags: [] },
      status: 'PUBLISHED',
    })
    const one = await cms.findRecord('stories', story.id, { resolveRelations: true })
    assert.equal(one.data.author, 'Bob')
    assert.equal(one.data.tags, '')
  })

  test('the public records endpoint serves labels', async ({ client, assert }) => {
    const { story } = await seedRecords()
    const res = await client.get('/api/public/cms/stories/records')
    res.assertStatus(200)
    const rec = res.body().items.find((r: any) => r.id === story.id)
    assert.equal(rec.data.author, 'Ada')
    assert.equal(rec.data.tags, 'x, y')
  })
})
