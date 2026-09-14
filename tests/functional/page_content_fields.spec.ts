import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PagesService from '#services/pages_service'
import Page from '#models/page'
import PageRevision from '#models/page_revision'

/**
 * `contentFields` — kit-author-declared text/image/video/setting values for a
 * CODE page whose resolved template has no real `<BuilderRegion/>` (see
 * `KitCapability` in `inertia/custom/types.ts`). Threaded through
 * create/update/saveDraft/publish/discardDraft exactly like `content`/`seo`.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

test.group('Pages | contentFields staging', (group) => {
  group.each.setup(async () => resetDatabase())

  test('saveDraft stages field edits without touching the live page', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, {
      title: 'P',
      path: 'p-fields',
      contentFields: { headline: 'Live headline' },
    })
    await svc.update(page.id, 1, { status: 'PUBLISHED' })
    await Page.query().where('id', page.id).update({ rendered_html: '<html>cached</html>' })

    await svc.saveDraft(page.id, { contentFields: { headline: 'Drafted headline' } })

    const row = await Page.findOrFail(page.id)
    assert.deepEqual(row.contentFields, { headline: 'Live headline' })
    assert.equal(row.renderedHtml, '<html>cached</html>')
    assert.deepEqual(row.draftContentFields, { headline: 'Drafted headline' })
  })

  test('publish with no explicit fields promotes the staged draft', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, {
      title: 'P',
      path: 'p-fields-2',
      contentFields: { headline: 'Live' },
    })
    await svc.update(page.id, 1, { status: 'PUBLISHED' })
    await svc.saveDraft(page.id, { contentFields: { headline: 'Drafted' } })

    await svc.publish(page.id, 1, {})

    const row = await Page.findOrFail(page.id)
    assert.deepEqual(row.contentFields, { headline: 'Drafted' })
    assert.isNull(row.draftContentFields)
    assert.isNull(row.renderedHtml) // snapshot invalidated
  })

  test('publish with explicit fields uses those over any staged draft', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'p-fields-3' })
    await svc.saveDraft(page.id, { contentFields: { headline: 'Drafted' } })

    await svc.publish(page.id, 1, { contentFields: { headline: 'Explicit' } })

    const row = await Page.findOrFail(page.id)
    assert.deepEqual(row.contentFields, { headline: 'Explicit' })
    assert.isNull(row.draftContentFields)
  })

  test('discardDraft throws staged field edits away', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'p-fields-4' })
    await svc.saveDraft(page.id, { contentFields: { headline: 'Drafted' } })
    await svc.discardDraft(page.id)
    const row = await Page.findOrFail(page.id)
    assert.isNull(row.draftContentFields)
  })

  test('a contentFields-only update snapshots a revision and can be restored', async ({
    assert,
  }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'p-fields-5' })
    await svc.update(page.id, 1, { contentFields: { headline: 'First' } })
    await svc.update(page.id, 1, { contentFields: { headline: 'Second' } })

    const revisions = await svc.listRevisions(page.id)
    assert.isAtLeast(revisions.length, 2)
    const firstRevision = await PageRevision.query()
      .where('page_id', page.id)
      .orderBy('created_at', 'asc')
      .firstOrFail()
    assert.deepEqual(firstRevision.contentFields, { headline: 'First' })

    await svc.restoreRevision(page.id, firstRevision.id, 1)
    const row = await Page.findOrFail(page.id)
    assert.deepEqual(row.contentFields, { headline: 'First' })
  })

  test('duplicate copies contentFields to the new page', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, {
      title: 'P',
      path: 'p-fields-6',
      contentFields: { headline: 'Original' },
    })
    const copy = await svc.duplicate(page.id, 1)
    const row = await Page.findOrFail(copy.id)
    assert.deepEqual(row.contentFields, { headline: 'Original' })
  })
})
