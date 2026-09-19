import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Page from '#models/page'
import Media from '#models/media'
import CmsService from '#services/cms_service'
import { WebSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'

/**
 * Collection → "Public detail pages": every PUBLISHED record of an opted-in
 * collection is served at `/<prefix>/<slug>` through a CODE/kit template page,
 * with no Page row per record. Off by default; every unhealthy state is a 404.
 */

const cms = new CmsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  // `truncate` keeps dynamic tables; drop the ones these tests create so a later
  // run (or another spec reusing a key) never inherits a stale schema.
  for (const key of ['portfolio', 'cases', 'a', 'b', 'c']) {
    await db.connection().schema.dropTableIfExists(`cms_${key}`)
  }
  return cleanup
}

function inertia(client: ApiClient, url: string) {
  return client.get(url).header('x-inertia', 'true').header('x-inertia-version', '1')
}

async function expectStatus(client: ApiClient, url: string, status: number) {
  const res = await inertia(client, url)
  res.assertStatus(status)
}

async function templatePage(overrides: Record<string, unknown> = {}) {
  return Page.create({
    id: newUlid(),
    title: 'Portfolio case template',
    path: 'portfolio-case-template',
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'CODE',
    component: 'x',
    content: { root: {}, content: [] },
    seo: {},
    ...overrides,
  } as never)
}

const FIELDS = [
  { key: 'title', label: 'Title', type: 'TEXT' as const, required: true },
  { key: 'slug', label: 'Slug', type: 'SLUG' as const, unique: true },
  { key: 'summary', label: 'Summary', type: 'TEXTAREA' as const },
  { key: 'cover', label: 'Cover', type: 'MEDIA' as const },
]

async function portfolio(opts: { on?: boolean; pageId?: string | null; prefix?: string } = {}) {
  return cms.createCollection({
    key: 'portfolio',
    label: 'Portfolio',
    draftsOn: true,
    detailPagesOn: opts.on ?? true,
    detailPathPrefix: opts.prefix ?? 'portfolio',
    detailPageId: opts.pageId ?? null,
    fields: FIELDS,
  })
}

async function record(title: string, status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED', data = {}) {
  return cms.createRecord('portfolio', null, { data: { title, ...data }, status })
}

test.group('Collection detail pages — serving', (group) => {
  group.each.setup(async () => resetDatabase())

  test('off by default: nothing is exposed', async ({ client }) => {
    await cms.createCollection({ key: 'portfolio', label: 'Portfolio', fields: FIELDS })
    await record('Rapid Plumbing')
    const res = await inertia(client, '/portfolio/rapid-plumbing')
    res.assertStatus(404)
  })

  test('a published record renders through the template with bindings and record', async ({
    client,
    assert,
  }) => {
    const page = await templatePage()
    await portfolio({ pageId: page.id })
    await record('Rapid Plumbing', 'PUBLISHED', { summary: '<p>Fast &amp; reliable pipes.</p>' })

    const res = await inertia(client, '/portfolio/rapid-plumbing')
    res.assertStatus(200)
    assert.equal(res.body().component, 'public/code_ssr')
    const p = res.body().props.page
    assert.deepEqual(p.bindings, { collection: 'portfolio', slug: 'rapid-plumbing' })
    assert.equal(p.record.collection, 'portfolio')
    assert.equal(p.record.item.data.title, 'Rapid Plumbing')
    assert.equal(p.record.item.data.slug, 'rapid-plumbing')
    // Per-record SEO, not the template's.
    assert.equal(p.seo.title, 'Rapid Plumbing')
    assert.match(p.seo.canonical, /\/portfolio\/rapid-plumbing$/)
    assert.include(p.seo.description, 'Fast & reliable pipes.')
    assert.equal(res.header('cache-control'), 'no-store')
  })

  test('MEDIA arrives as a URL and becomes an absolute og:image', async ({ client, assert }) => {
    const page = await templatePage()
    await portfolio({ pageId: page.id })
    const media = await Media.create({
      id: newUlid(),
      filename: `${newUlid()}.jpg`,
      mimeType: 'image/jpeg',
      size: 10,
      url: '/uploads/cover.jpg',
    })
    await record('With cover', 'PUBLISHED', { cover: media.id })

    const res = await inertia(client, '/portfolio/with-cover')
    res.assertStatus(200)
    const p = res.body().props.page
    assert.equal(p.record.item.data.cover, '/uploads/cover.jpg')
    assert.match(p.seo.ogImage, /^https?:\/\/.+\/uploads\/cover\.jpg$/)
  })

  test('draft, missing and trashed records are 404', async ({ client }) => {
    const page = await templatePage()
    await portfolio({ pageId: page.id })
    await record('Hidden draft', 'DRAFT')
    const gone = await record('Deleted one')
    await cms.deleteRecord('portfolio', gone.id)

    await expectStatus(client, '/portfolio/hidden-draft', 404)
    await expectStatus(client, '/portfolio/deleted-one', 404)
    await expectStatus(client, '/portfolio/never-existed', 404)
  })

  test('a template that is unset, draft, deleted or not CODE fails closed to 404', async ({
    client,
  }) => {
    await portfolio({ pageId: null })
    await record('Rapid Plumbing')
    await expectStatus(client, '/portfolio/rapid-plumbing', 404)

    const draft = await templatePage({ status: 'DRAFT', path: 'draft-template' })
    await cms.updateCollection('portfolio', { detailPageId: draft.id })
    await expectStatus(client, '/portfolio/rapid-plumbing', 404)

    const builder = await templatePage({ kind: 'BUILDER', component: null, path: 'builder-tpl' })
    await Page.query().where('id', draft.id).update({ status: 'PUBLISHED' })
    await cms.updateCollection('portfolio', { detailPageId: draft.id })
    await expectStatus(client, '/portfolio/rapid-plumbing', 200)

    await Page.query().where('id', builder.id).update({ deleted_at: new Date().toISOString() })
    await Page.query().where('id', draft.id).update({ deleted_at: new Date().toISOString() })
    await expectStatus(client, '/portfolio/rapid-plumbing', 404)
  })

  test('a Page on the exact path wins, and a nested path is not a detail page', async ({
    client,
    assert,
  }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    await templatePage({ path: 'portfolio/rapid-plumbing', title: 'Hand-made case' })

    const res = await inertia(client, '/portfolio/rapid-plumbing')
    res.assertStatus(200)
    assert.equal(res.body().props.page.title, 'Hand-made case')
    assert.isUndefined(res.body().props.page.record)

    await expectStatus(client, '/portfolio/rapid-plumbing/extra', 404)
  })

  test('a redirect on the same path loses to a live record', async ({ client, assert }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    const { default: RedirectsService } = await import('#services/redirects_service')
    await new RedirectsService().create({
      fromPath: 'portfolio/rapid-plumbing',
      toPath: '/elsewhere',
    } as never)
    const res = await inertia(client, '/portfolio/rapid-plumbing')
    res.assertStatus(200)
    assert.equal(res.body().props.page.record.item.data.title, 'Rapid Plumbing')
  })

  test('renaming a published record’s slug keeps the old URL alive with a 301', async ({
    client,
    assert,
  }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    const rec = await record('Rapid Plumbing')
    await cms.updateRecord('portfolio', rec.id, null, { data: { slug: 'rapid-plumbing-co' } })

    await expectStatus(client, '/portfolio/rapid-plumbing-co', 200)
    const old = await client.get('/portfolio/rapid-plumbing').redirects(0)
    old.assertStatus(301)
    assert.equal(old.header('location'), '/portfolio/rapid-plumbing-co')
  })

  test('the sitemap lists published records and hides the template page', async ({
    client,
    assert,
  }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    await record('Hidden draft', 'DRAFT')
    const res = await client.get('/sitemap.xml')
    assert.include(res.text(), '/portfolio/rapid-plumbing')
    assert.notInclude(res.text(), 'hidden-draft')
    assert.notInclude(res.text(), 'portfolio-case-template')
  })

  test('an uppercase slug is not a match', async ({ client }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    await expectStatus(client, '/portfolio/rapid-plumbing', 200)
    await expectStatus(client, '/portfolio/Rapid-Plumbing', 404)
  })

  test('a template on an inactive kit fails closed to 404', async ({ client }) => {
    const template = await templatePage({ component: 'kit:example', path: 'kit-template' })
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    await expectStatus(client, '/portfolio/rapid-plumbing', 404)
  })

  test('changing an enabled collection’s prefix keeps every entry’s old URL alive', async ({
    client,
    assert,
  }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    await cms.updateCollection('portfolio', { detailPathPrefix: 'work' })
    await expectStatus(client, '/work/rapid-plumbing', 200)
    const old = await client.get('/portfolio/rapid-plumbing').redirects(0)
    old.assertStatus(301)
    assert.equal(old.header('location'), '/work/rapid-plumbing')
  })

  test('the sitemap lists every published record, not only the first page of them', async ({
    client,
    assert,
  }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    for (let i = 0; i < 120; i++) await record(`Project ${i}`)
    const res = await client.get('/sitemap.xml')
    const locs = res.text().match(/\/portfolio\/project-\d+/g) ?? []
    assert.lengthOf(locs, 120)
  })

  test('turning it off again stops serving immediately', async ({ client }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    await record('Rapid Plumbing')
    await expectStatus(client, '/portfolio/rapid-plumbing', 200)
    await cms.updateCollection('portfolio', { detailPagesOn: false })
    await expectStatus(client, '/portfolio/rapid-plumbing', 404)
  })
})

test.group('Collection detail pages — settings rules', (group) => {
  group.each.setup(async () => resetDatabase())

  async function fails(
    run: () => Promise<unknown>,
    message: string,
    assert: { include(a: string, b: string): void; fail(m: string): void }
  ) {
    try {
      await run()
    } catch (e) {
      assert.include((e as Error).message, message)
      return
    }
    assert.fail(`expected an error containing "${message}"`)
  }

  test('needs a prefix, a slug field, and a regular collection', async ({ assert }) => {
    await fails(
      () =>
        cms.createCollection({
          key: 'a',
          label: 'A',
          detailPagesOn: true,
          fields: FIELDS,
        }),
      'Set a URL prefix',
      assert
    )
    await fails(
      () =>
        cms.createCollection({
          key: 'b',
          label: 'B',
          detailPagesOn: true,
          detailPathPrefix: 'b',
          fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
        }),
      'need a slug field',
      assert
    )
    await fails(
      () =>
        cms.createCollection({
          key: 'c',
          label: 'C',
          kind: 'single',
          detailPagesOn: true,
          detailPathPrefix: 'c',
          fields: FIELDS,
        }),
      'many records',
      assert
    )
  })

  test('rejects reserved, blog and malformed prefixes', async ({ assert }) => {
    for (const [prefix, message] of [
      ['admin', 'reserved'],
      ['posts', 'blog'],
      ['category', 'blog'],
      ['tag', 'blog'],
      ['Bad Prefix!', 'single segment'],
      ['a/b', 'single segment'],
    ] as const) {
      await fails(() => portfolio({ prefix }), message, assert)
    }
  })

  test('a prefix is unique among live collections', async ({ assert }) => {
    await portfolio()
    await fails(
      () =>
        cms.createCollection({
          key: 'cases',
          label: 'Cases',
          detailPagesOn: true,
          detailPathPrefix: 'portfolio',
          fields: FIELDS,
        }),
      'already the detail prefix',
      assert
    )
  })

  test('the blog prefix cannot be moved onto a collection prefix, and vice versa', async ({
    assert,
  }) => {
    await portfolio()
    const settings = new WebSettingsService()
    await fails(
      () =>
        settings.applyPatches([
          { section: 'content_paths', key: 'posts_archive_prefix', value: 'portfolio' },
        ]),
      'detail prefix of a collection',
      assert
    )
    await settings.applyPatches([
      { section: 'content_paths', key: 'post_detail_prefix', value: 'insights' },
    ])
    await fails(
      () => cms.updateCollection('portfolio', { detailPathPrefix: 'insights' }),
      'used by the blog',
      assert
    )
  })

  test('the slug field cannot be deleted while detail pages are on', async ({ assert }) => {
    await portfolio()
    await fails(
      () => cms.deleteField('portfolio', 'slug'),
      'turn the detail pages off first',
      assert
    )
  })

  test('a builder page is refused as the template', async ({ assert }) => {
    await portfolio()
    const builder = await templatePage({ kind: 'BUILDER', component: null, path: 'builder-tpl' })
    await fails(
      () => cms.updateCollection('portfolio', { detailPageId: builder.id }),
      'CODE',
      assert
    )
  })

  test('saving other settings never re-checks an unchanged template or prefix', async ({
    assert,
  }) => {
    const template = await templatePage()
    await portfolio({ pageId: template.id })
    // The template is deleted, then the blog takes the prefix — a later, unrelated
    // save (the admin form re-sends the whole block) must still work.
    await Page.query().where('id', template.id).update({ deleted_at: new Date().toISOString() })
    const saved = await cms.updateCollection('portfolio', {
      label: 'Our work',
      detailPagesOn: true,
      detailPathPrefix: 'portfolio',
      detailPageId: template.id,
    })
    assert.equal(saved.label, 'Our work')
    // …and it can always be switched off.
    const off = await cms.updateCollection('portfolio', { detailPagesOn: false })
    assert.isFalse(off.detailPagesOn)
  })

  test('the slug field must be unique', async ({ assert }) => {
    await fails(
      () =>
        cms.createCollection({
          key: 'a',
          label: 'A',
          detailPagesOn: true,
          detailPathPrefix: 'a',
          fields: [{ key: 'slug', label: 'Slug', type: 'SLUG' }],
        }),
      'must be unique',
      assert
    )
  })

  test('an untouched restore keeps the toggle and prefix', async ({ assert }) => {
    await portfolio()
    await cms.deleteCollection('portfolio')
    const restored = await cms.restoreCollection('portfolio')
    assert.isTrue(restored.detailPagesOn)
    assert.equal(restored.detailPathPrefix, 'portfolio')
  })

  test('a restore whose prefix the blog has taken meanwhile comes back with the pages off', async ({
    assert,
  }) => {
    await portfolio()
    await cms.deleteCollection('portfolio')
    await new WebSettingsService().applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'portfolio' },
    ])
    const restored = await cms.restoreCollection('portfolio')
    assert.isFalse(restored.detailPagesOn)
    assert.isNull(restored.detailPathPrefix)
  })

  test('the toggle and prefix survive a trash and restore; a taken prefix is dropped', async ({
    assert,
  }) => {
    await portfolio()
    await cms.deleteCollection('portfolio')
    await cms.createCollection({
      key: 'cases',
      label: 'Cases',
      detailPagesOn: true,
      detailPathPrefix: 'portfolio',
      fields: FIELDS,
    })
    const restored = await cms.restoreCollection('portfolio')
    assert.isFalse(restored.detailPagesOn)
    assert.isNull(restored.detailPathPrefix)
  })
})
