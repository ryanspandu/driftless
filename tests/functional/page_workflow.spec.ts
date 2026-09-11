import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import PagesService from '#services/pages_service'
import Page from '#models/page'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const doc = (marker: string) => ({ root: {}, content: [{ type: 'Text', props: { text: marker } }] })

test.group('Pages | draft staging', (group) => {
  group.each.setup(async () => resetDatabase())

  test('saveDraft stages edits without changing the live page or its snapshot', async ({
    assert,
  }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'p', content: doc('LIVE') })
    await svc.update(page.id, 1, { status: 'PUBLISHED' })
    // Pretend an SSG snapshot exists.
    await Page.query().where('id', page.id).update({ rendered_html: '<html>cached</html>' })

    await svc.saveDraft(page.id, { content: doc('DRAFTED') })

    const row = await Page.findOrFail(page.id)
    // Live content and snapshot untouched.
    assert.equal(
      (row.content as { content: { props: { text: string } }[] }).content[0].props.text,
      'LIVE'
    )
    assert.equal(row.renderedHtml, '<html>cached</html>')
    // Draft holds the new design.
    assert.isNotNull(row.draftContent)
    assert.equal(
      (row.draftContent as { content: { props: { text: string } }[] }).content[0].props.text,
      'DRAFTED'
    )
  })

  test('publish promotes the draft to live and clears it', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'p2', content: doc('LIVE') })
    await svc.update(page.id, 1, { status: 'PUBLISHED' })
    await svc.saveDraft(page.id, { content: doc('DRAFTED') })

    // Publish with no explicit content promotes the staged draft.
    await svc.publish(page.id, 1, {})

    const row = await Page.findOrFail(page.id)
    assert.equal(
      (row.content as { content: { props: { text: string } }[] }).content[0].props.text,
      'DRAFTED'
    )
    assert.isNull(row.draftContent)
    assert.isNull(row.renderedHtml) // snapshot invalidated
  })

  test('discardDraft throws staged edits away', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'P', path: 'p3', content: doc('LIVE') })
    await svc.saveDraft(page.id, { content: doc('DRAFTED') })
    await svc.discardDraft(page.id)
    const row = await Page.findOrFail(page.id)
    assert.isNull(row.draftContent)
  })
})

test.group('Pages | scheduling', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a due scheduled_publish_at publishes the draft', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'S', path: 'sched', content: doc('X') })
    await svc.update(page.id, 1, {
      scheduledPublishAt: DateTime.now().minus({ minutes: 5 }).toISO(),
    })

    const result = await svc.runScheduled()
    assert.equal(result.published, 1)
    const row = await Page.findOrFail(page.id)
    assert.equal(row.status, 'PUBLISHED')
    assert.isNull(row.scheduledPublishAt)
  })

  test('a due scheduled_unpublish_at reverts to draft', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'S', path: 'sched2', content: doc('X') })
    await svc.update(page.id, 1, {
      status: 'PUBLISHED',
      scheduledUnpublishAt: DateTime.now().minus({ minutes: 1 }).toISO(),
    })

    const result = await svc.runScheduled()
    assert.equal(result.unpublished, 1)
    const row = await Page.findOrFail(page.id)
    assert.equal(row.status, 'DRAFT')
  })

  test('a future schedule is left alone', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'S', path: 'sched3', content: doc('X') })
    await svc.update(page.id, 1, {
      scheduledPublishAt: DateTime.now().plus({ days: 1 }).toISO(),
    })
    const result = await svc.runScheduled()
    assert.equal(result.published, 0)
    assert.equal((await Page.findOrFail(page.id)).status, 'DRAFT')
  })
})

test.group('Pages | ops + preview', (group) => {
  group.each.setup(async () => resetDatabase())

  test('duplicate creates a DRAFT copy with a free path', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'Orig', path: 'orig', content: doc('X') })
    const copy = await svc.duplicate(page.id, 1)
    assert.equal(copy.status, 'DRAFT')
    assert.notEqual(copy.path, page.path)
    assert.include(copy.title, 'copy')
  })

  test('export → import round-trips a page as a draft', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'Exp', path: 'exp', content: doc('HELLO') })
    const bundle = await svc.exportPage(page.id)
    const imported = await svc.importPage(1, bundle)
    assert.equal(imported.status, 'DRAFT')
    assert.equal(
      (imported.content as { content: { props: { text: string } }[] }).content[0].props.text,
      'HELLO'
    )
  })

  test('a shareable preview token renders the draft; a bad token 404s', async ({
    client,
    assert,
  }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'Prev', path: 'prev', content: doc('LIVE') })
    await svc.saveDraft(page.id, { content: doc('DRAFTED') })
    const token = await svc.ensurePreviewToken(page.id)

    const ok = await client.get(`/preview/${token}`)
    ok.assertStatus(200)
    assert.equal(ok.header('x-robots-tag'), 'noindex, nofollow')

    const bad = await client.get('/preview/nope-not-a-token')
    bad.assertStatus(404)
  })

  test('bulk publish flips many drafts at once', async ({ client, assert }) => {
    const svc = new PagesService()
    const a = await svc.create(1, { title: 'A', path: 'ba', content: doc('X') })
    const b = await svc.create(1, { title: 'B', path: 'bb', content: doc('X') })
    const User = (await import('#models/user')).default
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()

    const res = await client
      .post('/api/admin/pages/bulk')
      .json({ ids: [a.id, b.id], action: 'publish' })
      .loginAs(admin)
    res.assertStatus(200)
    assert.equal(res.body().count, 2)
    assert.equal((await Page.findOrFail(a.id)).status, 'PUBLISHED')
    assert.equal((await Page.findOrFail(b.id)).status, 'PUBLISHED')
  })
})
