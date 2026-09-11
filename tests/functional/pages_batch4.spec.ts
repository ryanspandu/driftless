import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import PagesService from '#services/pages_service'
import RedirectsService from '#services/redirects_service'
import Page from '#models/page'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const doc = (marker: string) => ({ root: {}, content: [{ type: 'Text', props: { text: marker } }] })
const text = (v: unknown) => (v as { content: { props: { text: string } }[] }).content[0].props.text

test.group('Pages | batch-4 fixes', (group) => {
  group.each.setup(async () => resetDatabase())

  test('saveDraft does not bump updated_at (L8)', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'l8', content: doc('LIVE') })
    const before = await Page.findOrFail(page.id)
    const beforeUpdatedAt = before.updatedAt.toMillis()

    await svc.saveDraft(page.id, { content: doc('DRAFTED') })

    const after = await Page.findOrFail(page.id)
    assert.equal(after.updatedAt.toMillis(), beforeUpdatedAt)
    assert.isNotNull(after.draftUpdatedAt)
  })

  test('publishing via update() promotes the staged draft (M9)', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'm9', content: doc('LIVE') })
    await svc.saveDraft(page.id, { content: doc('DRAFTED') })

    // The Edit-settings dialog publishes via update() with no content.
    await svc.update(page.id, 1, { status: 'PUBLISHED' })

    const row = await Page.findOrFail(page.id)
    assert.equal(row.status, 'PUBLISHED')
    assert.equal(text(row.content), 'DRAFTED')
    assert.isNull(row.draftContent)
  })

  test('publishing clears a consumed scheduled_publish_at (L7)', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'l7', content: doc('X') })
    await svc.update(page.id, 1, {
      scheduledPublishAt: DateTime.now().plus({ days: 1 }).toISO(),
    })
    await svc.update(page.id, 1, { status: 'PUBLISHED' })

    const row = await Page.findOrFail(page.id)
    assert.equal(row.status, 'PUBLISHED')
    assert.isNull(row.scheduledPublishAt)
  })

  test('importPage rejects a non-Driftless JSON blob (L9)', async ({ assert }) => {
    const svc = new PagesService()
    await assert.rejects(() => svc.importPage(1, { title: 'Evil', content: {} }))
    // A real export is accepted.
    const page = await svc.create(1, { title: 'Src', path: 'src', content: doc('X') })
    const bundle = await svc.exportPage(page.id)
    const imported = await svc.importPage(1, bundle)
    assert.equal(imported.status, 'DRAFT')
  })

  test('redirect create rejects a reverse 2-cycle (L6)', async ({ assert }) => {
    const svc = new RedirectsService()
    await svc.create({ fromPath: 'a', toPath: '/b' })
    await assert.rejects(() => svc.create({ fromPath: 'b', toPath: '/a' }))
  })
})
