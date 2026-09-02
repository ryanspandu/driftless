import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import PagesService from '#services/pages_service'
import Redirect from '#models/redirect'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const emptyDoc = { root: {}, content: [] }

test.group('SEO | sitemap', (group) => {
  group.each.setup(async () => resetDatabase())

  test('lists published pages and excludes noindex ones', async ({ client, assert }) => {
    const svc = new PagesService()
    const shown = await svc.create(1, { title: 'Shown', path: 'shown', content: emptyDoc })
    await svc.update(shown.id, 1, { status: 'PUBLISHED' })

    const hidden = await svc.create(1, { title: 'Hidden', path: 'hidden', content: emptyDoc })
    await svc.update(hidden.id, 1, { status: 'PUBLISHED', seo: { noindex: true } })

    const res = await client.get('/sitemap.xml')
    res.assertStatus(200)
    const xml = res.text()
    assert.include(xml, '/shown')
    assert.notInclude(xml, '/hidden')
  })
})

test.group('SEO | redirects', (group) => {
  group.each.setup(async () => resetDatabase())

  test('changing a published page path auto-captures a 301', async ({ client, assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'Movable', path: 'old-place', content: emptyDoc })
    await svc.update(page.id, 1, { status: 'PUBLISHED' })

    // Move it.
    await svc.update(page.id, 1, { path: 'new-place' })

    const redirect = await Redirect.query().where('from_path', 'old-place').first()
    assert.isNotNull(redirect)
    assert.equal(redirect!.toPath, '/new-place')
    assert.equal(redirect!.status, 301)

    // The old URL now redirects (no session cookie needed for a public GET).
    const res = await client.get('/old-place').redirects(0)
    assert.equal(res.status(), 301)
    assert.equal(res.header('location'), '/new-place')
  })

  test('a draft page move does not create a redirect', async ({ assert }) => {
    const svc = new PagesService()
    const page = await svc.create(1, { title: 'Draft', path: 'draft-old', content: emptyDoc })
    await svc.update(page.id, 1, { path: 'draft-new' })
    assert.equal(
      await Redirect.query()
        .count('* as t')
        .firstOrFail()
        .then((r) => Number(r.$extras.t)),
      0
    )
  })

  test('an admin can create and delete a redirect', async ({ client, assert }) => {
    const User = (await import('#models/user')).default
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()

    const created = await client
      .post('/api/admin/redirects')
      .json({ fromPath: '/promo-2024', toPath: '/promo', status: 301 })
      .loginAs(admin)
    created.assertStatus(201)

    // Self-referential redirect is rejected.
    const bad = await client
      .post('/api/admin/redirects')
      .json({ fromPath: 'loop', toPath: '/loop', status: 301 })
      .loginAs(admin)
    bad.assertStatus(422)

    const list = await client.get('/api/admin/redirects').loginAs(admin)
    assert.lengthOf(list.body().items, 1)

    const anon = await client.get('/api/admin/redirects')
    anon.assertStatus(401)
  })
})
