import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PageRevision from '#models/page_revision'
import PagesService from '#services/pages_service'

const pages = () => new PagesService()

test.group('Page revisions', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    return cleanup
  })

  test('a content change snapshots a revision', async ({ assert }) => {
    const page = await pages().create(1, {
      title: 'P',
      path: '/p',
      content: { root: {}, content: [] },
    })
    await pages().update(page.id, 1, { content: { root: {}, content: [{ type: 'Heading' }] } })
    const revs = await PageRevision.query().where('page_id', page.id)
    assert.isAtLeast(revs.length, 1)
  })

  test('revisions are pruned to the retention cap', async ({ assert }) => {
    const page = await pages().create(1, {
      title: 'P',
      path: '/p',
      content: { root: {}, content: [] },
    })
    // 60 distinct content edits → 60 revision snapshots, capped at 50.
    for (let i = 0; i < 60; i++) {
      await pages().update(page.id, 1, { content: { root: {}, content: [{ n: i }] } })
    }
    const count = await PageRevision.query()
      .where('page_id', page.id)
      .count('* as total')
      .firstOrFail()
    assert.isAtMost(Number(count.$extras.total), 50)
  })
})
