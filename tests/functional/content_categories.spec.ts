import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Content from '#models/content'
import ContentCategory from '#models/content_category'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import CmsService from '#services/cms_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'

async function adminId(): Promise<number> {
  const u = await User.query().where('email', 'admin@driftless.local').firstOrFail()
  return u.id
}

test.group('Content categories + multi-select', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  test('category CRUD: slug auto/dedupe, reparent + detach on delete', async ({ assert }) => {
    const svc = new ContentCategoryService()
    const a = await svc.create({ name: 'Tutorials' })
    assert.equal(a.slug, 'tutorials')
    const dup = await svc.create({ name: 'Tutorials' })
    assert.equal(dup.slug, 'tutorials-2')

    const child = await svc.create({ name: 'Beginner', parentId: a.id })
    assert.equal(child.parentId, a.id)

    // Assign the child to a post so delete has a pivot row to detach.
    const authorId = await adminId()
    const post = await new ContentService().create(authorId, {
      title: 'Hello',
      slug: 'hello',
      body: '<p>hi</p>',
      status: 'PUBLISHED',
      categoryIds: [child.id],
    })

    await svc.remove(a.id)
    // Child is reparented to null (not deleted).
    const reloadedChild = await ContentCategory.findOrFail(child.id)
    assert.isNull(reloadedChild.parentId)
    // The deleted parent's assignments are gone (child assignment still there).
    const rows = await db.from('content_post_category').where('content_id', post.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].category_id, child.id)
  })

  test('content create with categoryIds syncs the pivot + resolves on public read', async ({
    assert,
  }) => {
    const svc = new ContentCategoryService()
    const cat = await svc.create({ name: 'News' })
    const authorId = await adminId()

    const dto = await new ContentService().create(authorId, {
      title: 'Post',
      slug: 'post',
      body: '<p>x</p>',
      status: 'PUBLISHED',
      categoryIds: [cat.id],
    })
    assert.lengthOf(dto.categories, 1)
    assert.equal(dto.categories[0].slug, 'news')

    const inCat = await svc.publishedPostsInCategory('news')
    assert.lengthOf(inCat, 1)
    assert.equal(inCat[0].slug, 'post')
  })

  test('a MULTISELECT collection field round-trips a string[]', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createCollection({
      key: 'tagset',
      label: 'Tag set',
      fields: [
        {
          key: 'tags',
          label: 'Tags',
          type: 'MULTISELECT',
          config: {
            options: [
              { label: 'Alpha', value: 'a' },
              { label: 'Beta', value: 'b' },
            ],
          },
        },
      ],
    })
    const rec = await cms.createRecord('tagset', null, { data: { tags: ['a', 'b'] } })
    const read = await cms.findRecord('tagset', rec.id)
    assert.deepEqual(read.data.tags, ['a', 'b'])
  })

  test('data-transfer content section round-trips categories + assignments', async ({ assert }) => {
    const svc = new ContentCategoryService()
    const cat = await svc.create({ name: 'Guides' })
    const authorId = await adminId()
    const post = await new ContentService().create(authorId, {
      title: 'Guide',
      slug: 'guide',
      body: '<p>g</p>',
      status: 'PUBLISHED',
      categoryIds: [cat.id],
    })

    const archive = await new SiteExportService().export({ only: ['content'] })

    await db.from('content_post_category').delete()
    await Content.query().delete()
    await ContentCategory.query().delete()

    await new SiteImportService().import(archive, { authorId })

    assert.isNotNull(await ContentCategory.query().where('slug', 'guides').first())
    assert.isNotNull(await Content.query().where('slug', 'guide').first())
    const pivot = await db.from('content_post_category').where('content_id', post.id)
    assert.lengthOf(pivot, 1)
  })
})
