import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import CmsService from '#services/cms_service'
import ContentService from '#services/content_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

test.group('Content-type collections', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a CONTENT collection creates no physical table', async ({ assert }) => {
    const cms = new CmsService()
    const col = await cms.createCollection({
      key: 'article_meta',
      label: 'Article meta',
      type: 'CONTENT',
      fields: [{ key: 'subtitle', label: 'Subtitle', type: 'TEXT' }],
    })
    assert.equal(col.type, 'CONTENT')
    assert.isNull(col.tableName ?? null)
    const hasTable = await db.connection().schema.hasTable('cms_article_meta')
    assert.isFalse(hasTable)
  })

  test('only one CONTENT collection may exist (singleton)', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createCollection({ key: 'article_meta', label: 'Article meta', type: 'CONTENT' })
    await assert.rejects(
      () => cms.createCollection({ key: 'post_meta', label: 'Post meta', type: 'CONTENT' }),
      /only one/i
    )
  })

  test('CONTENT collections cannot reserve built-in Content field keys', async ({ assert }) => {
    const cms = new CmsService()
    await assert.rejects(
      () =>
        cms.createCollection({
          key: 'article_meta',
          label: 'Article meta',
          type: 'CONTENT',
          fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
        }),
      /built-in Content field/i
    )
  })

  test('a CONTENT collection refuses generic record writes', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createCollection({
      key: 'article_meta',
      label: 'Article meta',
      type: 'CONTENT',
      fields: [{ key: 'subtitle', label: 'Subtitle', type: 'TEXT' }],
    })
    await assert.rejects(
      () => cms.createRecord('article_meta', 1, { data: { subtitle: 'x' } }),
      /Content-type collection/i
    )
  })

  test('content_service persists coerced custom data and drops unknown keys', async ({
    assert,
  }) => {
    const cms = new CmsService()
    await cms.createCollection({
      key: 'article_meta',
      label: 'Article meta',
      type: 'CONTENT',
      fields: [
        { key: 'subtitle', label: 'Subtitle', type: 'TEXT' },
        { key: 'reading_minutes', label: 'Reading minutes', type: 'INTEGER' },
      ],
    })

    const content = new ContentService()
    const created = await content.create(1, {
      title: 'Hello',
      slug: 'hello',
      body: '<p>Hi</p>',
      status: 'PUBLISHED',
      featuredImage: '/uploads/thumb.png',
      data: { subtitle: 'A subtitle', reading_minutes: '7', bogus: 'dropped' },
    })

    assert.equal(created.featuredImage, '/uploads/thumb.png')
    assert.deepEqual(created.data, { subtitle: 'A subtitle', reading_minutes: 7 })
    assert.notProperty(created.data ?? {}, 'bogus')
  })

  test('relation ids in content data resolve to labels for the public post', async ({ assert }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_categories"')
    const cms = new CmsService()

    // A normal records collection acts as the category taxonomy.
    await cms.createCollection({
      key: 'categories',
      label: 'Categories',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    const tech = await cms.createRecord('categories', 1, {
      data: { title: 'Tech' },
      status: 'PUBLISHED',
    })
    const news = await cms.createRecord('categories', 1, {
      data: { title: 'News' },
      status: 'PUBLISHED',
    })

    // The Content-type collection relates to it (many-to-many).
    await cms.createCollection({ key: 'article_meta', label: 'Article meta', type: 'CONTENT' })
    await cms.addField('article_meta', {
      key: 'categories',
      label: 'Categories',
      type: 'RELATION',
      config: { targetKey: 'categories', relationType: 'manyToMany' },
    })

    const content = new ContentService()
    await content.create(1, {
      title: 'Post',
      slug: 'post',
      body: '<p>Body</p>',
      status: 'PUBLISHED',
      data: { categories: [tech.id, news.id] },
    })

    const publicDto = await content.findPublishedBySlug('post')
    assert.deepEqual(publicDto.data?.categories, ['Tech', 'News'])
  })

  test('a records collection can be created with a relation field in one step', async ({
    assert,
  }) => {
    // Drop the join table first — it has FKs to the two tables below.
    await db.rawQuery('DROP TABLE IF EXISTS "cms_articles_tags"')
    await db.rawQuery('DROP TABLE IF EXISTS "cms_articles"')
    await db.rawQuery('DROP TABLE IF EXISTS "cms_tags"')
    const cms = new CmsService()

    await cms.createCollection({
      key: 'tags',
      label: 'Tags',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    const green = await cms.createRecord('tags', 1, {
      data: { title: 'Green' },
      status: 'PUBLISHED',
    })

    // Relation field supplied at creation time (previously only addable later).
    await cms.createCollection({
      key: 'articles',
      label: 'Articles',
      fields: [
        { key: 'title', label: 'Title', type: 'TEXT' },
        {
          key: 'tags',
          label: 'Tags',
          type: 'RELATION',
          config: { targetKey: 'tags', relationType: 'manyToMany' },
        },
      ],
    })

    // The many-to-many join table exists and records round-trip through it.
    const rec = await cms.createRecord('articles', 1, {
      data: { title: 'A', tags: [green.id] },
      status: 'PUBLISHED',
    })
    const fetched = await cms.findRecord('articles', rec.id)
    assert.deepEqual(fetched.data.tags, [green.id])
  })

  test('renaming a records collection key renames its table and keeps records', async ({
    assert,
  }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_widgets"')
    await db.rawQuery('DROP TABLE IF EXISTS "cms_gadgets"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'widgets',
      label: 'Widgets',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    const rec = await cms.createRecord('widgets', 1, {
      data: { title: 'W1' },
      status: 'PUBLISHED',
    })

    const updated = await cms.updateCollection('widgets', { key: 'gadgets' })
    assert.equal(updated.key, 'gadgets')
    assert.isFalse(await db.connection().schema.hasTable('cms_widgets'))
    assert.isTrue(await db.connection().schema.hasTable('cms_gadgets'))
    // The record survives the rename, reachable under the new key.
    const stillThere = await cms.findRecord('gadgets', rec.id)
    assert.equal(stillThere.data.title, 'W1')
  })

  test('switching a non-empty records collection to Content is refused', async ({ assert }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_notes"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'notes',
      label: 'Notes',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.createRecord('notes', 1, { data: { title: 'n' }, status: 'PUBLISHED' })
    await assert.rejects(() => cms.updateCollection('notes', { type: 'CONTENT' }), /no records/i)
  })

  test('an empty records collection can switch to Content (drops its table)', async ({
    assert,
  }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_specs"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'specs',
      label: 'Specs',
      fields: [{ key: 'subtitle', label: 'Subtitle', type: 'TEXT' }],
    })
    const updated = await cms.updateCollection('specs', { type: 'CONTENT' })
    assert.equal(updated.type, 'CONTENT')
    assert.isFalse(await db.connection().schema.hasTable('cms_specs'))
    // It is now the singleton Content-type collection.
    const contentType = await cms.contentTypeCollection()
    assert.equal(contentType?.key, 'specs')
  })
})
