import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Page from '#models/page'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import ContentTagService from '#services/content_tag_service'
import { WebSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'

/**
 * `?q=` search resolved server-side on the public content archives — the same
 * pattern as the ecommerce storefront's `/shop?q=`: a shared/crawled search URL
 * must render real SSR results, not an empty client-fetched shell.
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

async function post(
  title: string,
  slug: string,
  opts: { body?: string; categoryIds?: string[]; tagIds?: string[] } = {}
) {
  return content.create(await adminId(), {
    title,
    slug,
    body: opts.body ?? `<p>body of ${slug}</p>`,
    status: 'PUBLISHED',
    categoryIds: opts.categoryIds,
    tagIds: opts.tagIds,
  })
}

/** Ask for the Inertia payload (component + props) rather than the rendered HTML. */
function inertia(client: ApiClient, url: string) {
  return client.get(url).header('x-inertia', 'true').header('x-inertia-version', '1')
}

function archivePage(pathSlug: string) {
  return Page.create({
    id: newUlid(),
    title: `Custom ${pathSlug}`,
    path: pathSlug,
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'BUILDER',
    content: { root: {}, content: [] },
    seo: {},
  } as never)
}

test.group('Content search — /blog, /category/:slug, /tag/:slug ?q=', (group) => {
  group.each.setup(async () => resetDatabase())

  test('/blog lists every published post with no query', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await post('Another post', 'another-post')

    const res = await inertia(client, '/blog')
    res.assertStatus(200)
    assert.equal(res.body().component, 'posts/index')
    const posts = res.body().props.posts as Array<{ slug: string }>
    assert.sameMembers(
      posts.map((p) => p.slug),
      ['hello-world', 'another-post']
    )
    assert.equal(res.body().props.total, 2)
    assert.equal(res.body().props.query, '')
    // The built-in listing (no postsArchive override configured) previously
    // shipped no canonical at all — now server-computed from the request.
    assert.match(res.body().props.canonicalUrl, /\/blog$/)
  })

  test('/blog?q= filters by title, server-side', async ({ client, assert }) => {
    await post('Hello world', 'hello-world')
    await post('Something else', 'something-else')

    const res = await inertia(client, '/blog?q=hello')
    res.assertStatus(200)
    const posts = res.body().props.posts as Array<{ slug: string }>
    assert.deepEqual(
      posts.map((p) => p.slug),
      ['hello-world']
    )
    assert.equal(res.body().props.total, 1)
    assert.equal(res.body().props.query, 'hello')
  })

  test('/blog?q= also matches body content, not just the title', async ({ client, assert }) => {
    await post('Post one', 'post-one', { body: '<p>mentions unicorn somewhere</p>' })
    await post('Post two', 'post-two', { body: '<p>no match here</p>' })

    const res = await inertia(client, '/blog?q=unicorn')
    const posts = res.body().props.posts as Array<{ slug: string }>
    assert.deepEqual(
      posts.map((p) => p.slug),
      ['post-one']
    )
  })

  test('/blog?q= is case-insensitive and matches nothing gracefully', async ({
    client,
    assert,
  }) => {
    await post('Hello World', 'hello-world')

    const matched = await inertia(client, '/blog?q=HELLO')
    assert.deepEqual(
      (matched.body().props.posts as Array<{ slug: string }>).map((p) => p.slug),
      ['hello-world']
    )

    const empty = await inertia(client, '/blog?q=nope-nothing-matches')
    assert.deepEqual(empty.body().props.posts, [])
    assert.equal(empty.body().props.total, 0)
  })

  test('/category/:slug?q= filters within that category only', async ({ client, assert }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' })
    await post('Big news update', 'big-news', { categoryIds: [cat.id] })
    await post('Quiet news day', 'quiet-news', { categoryIds: [cat.id] })
    await post('Update elsewhere', 'update-elsewhere') // matches "update" but not in category

    const res = await inertia(client, '/category/news?q=update')
    res.assertStatus(200)
    assert.equal(res.body().component, 'posts/category')
    const posts = res.body().props.posts as Array<{ slug: string }>
    assert.deepEqual(
      posts.map((p) => p.slug),
      ['big-news']
    )
    assert.equal(res.body().props.query, 'update')
    // Canonical drops the `?q=` — it points at the bare category URL.
    assert.match(res.body().props.canonicalUrl, /\/category\/news$/)
  })

  test('/tag/:slug?q= filters within that tag only', async ({ client, assert }) => {
    const tag = await new ContentTagService().create({ name: 'Featured', slug: 'featured' })
    await post('Featured launch', 'featured-launch', { tagIds: [tag.id] })
    await post('Featured recap', 'featured-recap', { tagIds: [tag.id] })
    await post('Launch elsewhere', 'launch-elsewhere')

    const res = await inertia(client, '/tag/featured?q=launch')
    res.assertStatus(200)
    assert.equal(res.body().component, 'posts/tag')
    const posts = res.body().props.posts as Array<{ slug: string }>
    assert.deepEqual(
      posts.map((p) => p.slug),
      ['featured-launch']
    )
    assert.match(res.body().props.canonicalUrl, /\/tag\/featured$/)
  })

  test('a designated page replaces the built-in /blog listing (postsArchive role)', async ({
    client,
    assert,
  }) => {
    await post('Hello world', 'hello-world')

    const before = await inertia(client, '/blog')
    assert.equal(before.body().component, 'posts/index')

    const page = await archivePage('custom-blog-index')
    await webSettings.applyPatches([
      { section: 'content_pages', key: 'posts_archive_page_id', value: page.id },
    ])

    const after = await inertia(client, '/blog')
    after.assertStatus(200)
    assert.equal(after.body().component, 'public/page_ssr')
    // The override page's own `path` column is `custom-blog-index` — the
    // canonical must reflect the URL actually served (`/blog`), not that.
    assert.match(after.body().props.page.seo.canonical, /\/blog$/)
  })

  test('a draft postsArchive override falls back to the built-in /blog listing', async ({
    client,
    assert,
  }) => {
    const page = await archivePage('custom-blog-index-draft')
    page.status = 'DRAFT'
    await page.save()
    await webSettings.applyPatches([
      { section: 'content_pages', key: 'posts_archive_page_id', value: page.id },
    ])

    const res = await inertia(client, '/blog')
    assert.equal(res.body().component, 'posts/index')
  })

  test('a CODE/kit postsArchive override receives the FULL post DTO in props.record', async ({
    client,
    assert,
  }) => {
    await post('Hello world', 'hello-world', { body: '<p>the full body, not trimmed</p>' })

    // Component need not exist for the server payload — the client would
    // resolve the kit component (mirrors the equivalent product-template test).
    const page = await Page.create({
      id: newUlid(),
      title: 'Kit blog index',
      path: 'kit-blog-index',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'CODE',
      component: 'x',
      content: { root: {}, content: [] },
      seo: {},
    } as never)
    await webSettings.applyPatches([
      { section: 'content_pages', key: 'posts_archive_page_id', value: page.id },
    ])

    const res = await inertia(client, '/blog')
    res.assertStatus(200)
    assert.equal(res.body().component, 'public/code_ssr')

    // The built-in listing's trimmed shape (id/title/slug/visibility/
    // featuredImage/updatedAt) is NOT what a kit template gets — it gets the
    // full PublicContentDto (body, categories, tags, custom `data`) so it can
    // render an excerpt/chips SSR instead of client-fetching them.
    const record = res.body().props.page.record as { items: Array<Record<string, unknown>> }
    assert.equal(record.items[0].body, '<p>the full body, not trimmed</p>')
    assert.property(record.items[0], 'categories')
    assert.property(record.items[0], 'tags')
  })
})
