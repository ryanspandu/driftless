import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Page from '#models/page'
import WebSetting from '#models/web_setting'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import { WebSettingsService } from '#services/settings_service'
import PagesService from '#services/pages_service'
import { newUlid } from '#services/ulid_service'

/**
 * Website settings → URLs: the built-in Content screens can live at an
 * operator-chosen prefix (e.g. `/insights`). Defaults are the historical routes,
 * and the historical routes 301 to the configured address once it is moved.
 */

const webSettings = new WebSettingsService()
const content = new ContentService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminId(): Promise<number> {
  const u = await User.query().where('email', 'admin@driftless.local').firstOrFail()
  return u.id
}

async function post(title: string, slug: string, categoryIds?: string[]) {
  return content.create(await adminId(), {
    title,
    slug,
    body: `<p>body of ${slug}</p>`,
    status: 'PUBLISHED',
    categoryIds,
  })
}

function inertia(client: ApiClient, url: string) {
  return client.get(url).header('x-inertia', 'true').header('x-inertia-version', '1')
}

async function moveBlogToInsights() {
  await webSettings.applyPatches([
    { section: 'content_paths', key: 'posts_archive_prefix', value: 'insights' },
    { section: 'content_paths', key: 'post_detail_prefix', value: 'insights' },
  ])
}

test.group('Content paths — defaults', (group) => {
  group.each.setup(async () => resetDatabase())

  test('nothing changes until a prefix is set', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    const archive = await inertia(client, '/blog')
    archive.assertStatus(200)
    assert.equal(archive.body().component, 'posts/index')
    const detail = await inertia(client, '/posts/hello-world')
    detail.assertStatus(200)
    assert.equal(detail.body().component, 'posts/show')
    assert.equal(detail.body().props.contentPaths.detail, 'posts')
  })
})

test.group('Content paths — a moved blog (/insights)', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the archive and the post render at the configured prefix', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await moveBlogToInsights()

    const archive = await inertia(client, '/insights')
    archive.assertStatus(200)
    assert.equal(archive.body().component, 'posts/index')
    assert.match(archive.body().props.canonicalUrl, /\/insights$/)

    const detail = await inertia(client, '/insights/hello-world')
    detail.assertStatus(200)
    assert.equal(detail.body().component, 'posts/show')
    assert.equal(detail.body().props.post.slug, 'hello-world')
    assert.match(detail.body().props.canonicalUrl, /\/insights\/hello-world$/)
    assert.equal(detail.body().props.contentPaths.archive, 'insights')
  })

  test('an unknown post at the new prefix is a 404', async ({ client }) => {
    await moveBlogToInsights()
    const res = await inertia(client, '/insights/nope')
    res.assertStatus(404)
  })

  test('the historical routes 301 to the new address and keep ?q=', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await moveBlogToInsights()

    const detail = await client.get('/posts/hello-world').redirects(0)
    detail.assertStatus(301)
    assert.equal(detail.header('location'), '/insights/hello-world')

    const archive = await client.get('/blog?q=hello').redirects(0)
    archive.assertStatus(301)
    assert.equal(archive.header('location'), '/insights?q=hello')
  })

  test('?q= search works at the new archive address', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await post('Something else', 'something-else')
    await moveBlogToInsights()

    const res = await inertia(client, '/insights?q=hello')
    res.assertStatus(200)
    const posts = res.body().props.posts as Array<{ slug: string }>
    assert.deepEqual(
      posts.map((p) => p.slug),
      ['hello-world']
    )
  })

  test('the category archive follows its own prefix', async ({ client, assert }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' } as never)
    await post('Hello world', 'hello-world', [cat.id])
    await webSettings.applyPatches([
      { section: 'content_paths', key: 'category_prefix', value: 'topics' },
    ])

    const res = await inertia(client, '/topics/news')
    res.assertStatus(200)
    assert.equal(res.body().component, 'posts/category')
    const old = await client.get('/category/news').redirects(0)
    old.assertStatus(301)
    assert.equal(old.header('location'), '/topics/news')
  })

  test('the sitemap lists posts under the configured prefix', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await moveBlogToInsights()
    const res = await client.get('/sitemap.xml')
    assert.include(res.text(), '/insights/hello-world')
    assert.notInclude(res.text(), '/posts/hello-world')
  })

  test('a page on the same path still wins over the archive', async ({ client, assert }) => {
    await moveBlogToInsights()
    await Page.create({
      id: newUlid(),
      title: 'Own insights page',
      path: 'insights',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
    } as never)
    const res = await inertia(client, '/insights')
    res.assertStatus(200)
    assert.equal(res.body().props.page.title, 'Own insights page')
  })

  test('trailing slash, ?q= and an encoded slug on the configured URL never redirect', async ({
    client,
    assert,
  }) => {
    await post('Hello world', 'hello-world')
    await moveBlogToInsights()
    for (const url of [
      '/insights/hello-world/',
      '/insights/hello-world?q=x',
      '/insights/hello%2Dworld',
    ]) {
      const res = await client.get(url).redirects(0)
      assert.equal(res.status(), 200, url)
    }
  })

  test('a moved blog can still be reached through a manual redirect for an old slug', async ({
    client,
    assert,
  }) => {
    await moveBlogToInsights()
    const { default: RedirectsService } = await import('#services/redirects_service')
    await new RedirectsService().create({
      fromPath: 'insights/old-post',
      toPath: '/insights/new-post',
    })
    // "No such post" must fall through to the redirect, not end in a 404.
    const res = await client.get('/insights/old-post').redirects(0)
    res.assertStatus(301)
    assert.equal(res.header('location'), '/insights/new-post')
  })

  test('the archive and the category may share one prefix', async ({ client, assert }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' } as never)
    await post('Hello world', 'hello-world', [cat.id])
    await webSettings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'topics' },
      { section: 'content_paths', key: 'category_prefix', value: 'topics' },
    ])
    const archive = await inertia(client, '/topics')
    assert.equal(archive.body().component, 'posts/index')
    const category = await inertia(client, '/topics/news')
    assert.equal(category.body().component, 'posts/category')
  })

  test('a nested prefix works for the archive and the post', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await webSettings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'resources/insights' },
      { section: 'content_paths', key: 'post_detail_prefix', value: 'resources/insights' },
    ])
    const archive = await inertia(client, '/resources/insights')
    assert.equal(archive.body().component, 'posts/index')
    const detail = await inertia(client, '/resources/insights/hello-world')
    assert.equal(detail.body().component, 'posts/show')
  })

  test('the public site being switched off redirects the configured URL too', async ({
    client,
    assert,
  }) => {
    await moveBlogToInsights()
    await webSettings.applyPatches([{ section: 'app_config', key: 'landing_enabled', value: '0' }])
    const res = await client.get('/insights').redirects(0)
    assert.equal(res.status(), 302)
    assert.equal(res.header('location'), '/login')
  })

  test('changing the prefix nulls cached SSG snapshots', async ({ assert }) => {
    const page = await Page.create({
      id: newUlid(),
      title: 'Cached',
      path: 'cached',
      status: 'PUBLISHED',
      renderMode: 'SSG',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
      renderedHtml: '<p>old</p>',
      renderedBuild: 'x',
    } as never)
    await moveBlogToInsights()
    await page.refresh()
    assert.isNull(page.renderedHtml)
  })
})

test.group('Content paths — validation', (group) => {
  group.each.setup(async () => resetDatabase())

  async function rejects(
    assert: { include(a: string, b: string): void; fail(m: string): void },
    patch: { key: string; value: string },
    message: string
  ) {
    try {
      await webSettings.applyPatches([{ section: 'content_paths', ...patch }])
    } catch (e) {
      assert.include((e as Error).message, message)
      return
    }
    assert.fail(`expected "${patch.value}" to be rejected`)
  }

  test('rejects a malformed prefix', async ({ assert }) => {
    await rejects(
      assert,
      { key: 'posts_archive_prefix', value: 'In Sights!' },
      'not a valid URL prefix'
    )
  })

  test('rejects a reserved route', async ({ assert }) => {
    await rejects(assert, { key: 'posts_archive_prefix', value: 'admin' }, 'reserved')
    await rejects(assert, { key: 'post_detail_prefix', value: 'api/x' }, 'reserved')
  })

  test('rejects a prefix an existing page occupies', async ({ assert }) => {
    await Page.create({
      id: newUlid(),
      title: 'Insights',
      path: 'insights/what-is-geo',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
    } as never)
    await rejects(assert, { key: 'post_detail_prefix', value: 'insights' }, 'a page already exists')
  })

  test('rejects two <prefix>/<slug> screens sharing a prefix', async ({ assert }) => {
    await rejects(assert, { key: 'category_prefix', value: 'posts' }, 'cannot share')
  })

  test('the value that is validated is the value that is stored (duplicate patches)', async ({
    assert,
  }) => {
    let message = ''
    try {
      await webSettings.applyPatches([
        { section: 'content_paths', key: 'posts_archive_prefix', value: 'insights' },
        { section: 'content_paths', key: 'posts_archive_prefix', value: 'admin' },
      ])
    } catch (e) {
      message = (e as Error).message
    }
    assert.include(message, 'reserved')
    const sections = await webSettings.getMergedSections()
    assert.equal(sections['content_paths']!['posts_archive_prefix'], 'blog')
  })

  test('a value is stored normalised, and a default is stored as no override', async ({
    assert,
  }) => {
    await webSettings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: ' /Insights/ ' },
      { section: 'content_paths', key: 'tag_prefix', value: 'tag' },
    ])
    const rows = await WebSetting.query().where('section', 'content_paths')
    assert.deepEqual(
      rows.map((r) => [r.key, r.value]),
      [['posts_archive_prefix', 'insights']]
    )
  })

  test('a page cannot be created under a moved prefix (and can under the defaults)', async ({
    assert,
  }) => {
    const pages = new PagesService()
    const admin = await adminId()
    const create = (path: string) =>
      pages.create(admin, { title: path, path, kind: 'BUILDER', status: 'DRAFT' } as never)

    // Defaults: the static routes already win, nothing is enforced.
    await create('blog/notes')

    await moveBlogToInsights()
    let message = ''
    try {
      await create('insights/hello')
    } catch (e) {
      message = (e as Error).message
    }
    assert.include(message, 'Website settings → URLs')
    await create('elsewhere')
  })

  test('empty resets to the default and is always allowed', async ({ assert }) => {
    await moveBlogToInsights()
    await webSettings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: '' },
      { section: 'content_paths', key: 'post_detail_prefix', value: '' },
    ])
    const sections = await webSettings.getMergedSections()
    assert.equal(sections['content_paths']!['posts_archive_prefix'], 'blog')
  })
})
