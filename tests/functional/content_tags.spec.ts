import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Content from '#models/content'
import ContentTag from '#models/content_tag'
import ContentService from '#services/content_service'
import ContentTagService from '#services/content_tag_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'

async function adminId(): Promise<number> {
  const u = await User.query().where('email', 'admin@driftless.local').firstOrFail()
  return u.id
}

test.group('Content tags', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  test('tag CRUD: slug auto/dedupe + detach on delete', async ({ assert }) => {
    const svc = new ContentTagService()
    const a = await svc.create({ name: 'JavaScript' })
    assert.equal(a.slug, 'javascript')
    const dup = await svc.create({ name: 'JavaScript' })
    assert.equal(dup.slug, 'javascript-2')

    const authorId = await adminId()
    const post = await new ContentService().create(authorId, {
      title: 'Hello',
      slug: 'hello',
      body: '<p>hi</p>',
      status: 'PUBLISHED',
      tagIds: [a.id],
    })

    await svc.remove(a.id)
    const rows = await db.from('content_post_tag').where('content_id', post.id)
    assert.lengthOf(rows, 0)
  })

  test('content create with tagIds syncs the pivot + resolves on public read', async ({
    assert,
  }) => {
    const svc = new ContentTagService()
    const tag = await svc.create({ name: 'News' })
    const authorId = await adminId()

    const dto = await new ContentService().create(authorId, {
      title: 'Post',
      slug: 'post',
      body: '<p>x</p>',
      status: 'PUBLISHED',
      tagIds: [tag.id],
    })
    assert.lengthOf(dto.tags, 1)
    assert.equal(dto.tags[0].slug, 'news')

    const inTag = await svc.publishedPostsInTag('news')
    assert.lengthOf(inTag, 1)
    assert.equal(inTag[0].slug, 'post')
  })

  test('data-transfer content section round-trips tags + assignments', async ({ assert }) => {
    const svc = new ContentTagService()
    const tag = await svc.create({ name: 'Guides' })
    const authorId = await adminId()
    const post = await new ContentService().create(authorId, {
      title: 'Guide',
      slug: 'guide',
      body: '<p>g</p>',
      status: 'PUBLISHED',
      tagIds: [tag.id],
    })

    const archive = await new SiteExportService().export({ only: ['content'] })

    await db.from('content_post_tag').delete()
    await Content.query().delete()
    await ContentTag.query().delete()

    await new SiteImportService().import(archive, { authorId })

    assert.isNotNull(await ContentTag.query().where('slug', 'guides').first())
    const pivot = await db.from('content_post_tag').where('content_id', post.id)
    assert.lengthOf(pivot, 1)
  })
})
