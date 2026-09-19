import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import { WebSettingsService } from '#services/settings_service'
import PageRolesService from '#services/page_roles_service'

const webSettings = new WebSettingsService()
const roles = new PageRolesService()

/**
 * A page standing in for a built-in screen ("Use as page") is a template served at that
 * screen's URL. Its own slug must not stay reachable as a second address.
 */
async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function seedPage(path: string, status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') {
  return Page.create({
    id: newUlid(),
    title: `Page ${path}`,
    path,
    status,
    renderMode: 'SSR',
    kind: 'BUILDER',
    content: { root: {}, content: [] },
    seo: {},
  } as never)
}

const assign = (section: string, key: string, value: string) =>
  webSettings.applyPatches([{ section, key, value }])

const noFollow = (client: ApiClient, url: string) => client.get(url).redirects(0)

test.group('Page roles | the real slug of a role page is not a second address', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a page with no role is served at its own slug', async ({ client }) => {
    await seedPage('plain-page')
    const res = await noFollow(client, '/plain-page')
    res.assertStatus(200)
  })

  test('the front page slug 301s to / and keeps the query string', async ({ client, assert }) => {
    const page = await seedPage('static-bloom')
    await assign('home_page', 'front_page_id', page.id)

    const res = await noFollow(client, '/static-bloom')
    res.assertStatus(301)
    assert.equal(res.header('location'), '/')

    const withQuery = await noFollow(client, '/static-bloom?utm=x')
    withQuery.assertStatus(301)
    assert.equal(withQuery.header('location'), '/?utm=x')

    // and the front page itself still renders at /
    const home = await client.get('/').header('x-inertia', 'true').header('x-inertia-version', '1')
    home.assertStatus(200)
    assert.equal(home.body().props.page.title, 'Page static-bloom')
  })

  test('the seeded landing page no longer answers at its own /home slug', async ({
    client,
    assert,
  }) => {
    const res = await noFollow(client, '/home')
    res.assertStatus(301)
    assert.equal(res.header('location'), '/')
  })

  test('the slug is reachable again once the page stops being the front page', async ({
    client,
  }) => {
    const page = await seedPage('was-front')
    await assign('home_page', 'front_page_id', page.id)
    await noFollow(client, '/was-front').then((r) => r.assertStatus(301))
    await assign('home_page', 'front_page_id', '')
    await noFollow(client, '/was-front').then((r) => r.assertStatus(200))
  })

  test('a sign-in page 301s to /login', async ({ client, assert }) => {
    const page = await seedPage('my-login')
    await assign('auth_pages', 'login_page_id', page.id)
    const res = await noFollow(client, '/my-login')
    res.assertStatus(301)
    assert.equal(res.header('location'), '/login')
  })

  test('the posts archive template 301s to the configured archive prefix', async ({
    client,
    assert,
  }) => {
    const page = await seedPage('all-posts')
    await assign('content_pages', 'posts_archive_page_id', page.id)
    const res = await noFollow(client, '/all-posts')
    res.assertStatus(301)
    assert.equal(res.header('location'), '/blog')
  })

  test('a role page whose slug is the screen URL still renders there', async ({ client }) => {
    const page = await seedPage('blog')
    await assign('content_pages', 'posts_archive_page_id', page.id)
    const res = await noFollow(client, '/blog')
    res.assertStatus(200)
  })

  test('a per-slug template (category archive) has no fixed URL, so its slug is a 404', async ({
    client,
  }) => {
    const page = await seedPage('categories-template')
    await assign('content_pages', 'category_archive_page_id', page.id)
    const res = await noFollow(client, '/categories-template')
    res.assertStatus(404)
  })

  test('an error page slug is a 404', async ({ client }) => {
    const page = await seedPage('oops')
    await assign('error_pages', 'not_found_page_id', page.id)
    const res = await noFollow(client, '/oops')
    res.assertStatus(404)
  })

  test('urlFor reports undefined / null / a URL for none / no-URL / URL roles', async ({
    assert,
  }) => {
    const plain = await seedPage('plain')
    const front = await seedPage('front')
    const tpl = await seedPage('tpl')
    await assign('home_page', 'front_page_id', front.id)
    await assign('content_pages', 'tag_archive_page_id', tpl.id)

    assert.isUndefined(await roles.urlFor(plain.id))
    assert.equal(await roles.urlFor(front.id), '/')
    assert.isNull(await roles.urlFor(tpl.id))
  })

  test('a role page is left out of the sitemap under either address', async ({
    client,
    assert,
  }) => {
    const page = await seedPage('static-bloom')
    await assign('home_page', 'front_page_id', page.id)
    const res = await client.get('/sitemap.xml')
    assert.notInclude(res.text(), '/static-bloom')
  })
})
