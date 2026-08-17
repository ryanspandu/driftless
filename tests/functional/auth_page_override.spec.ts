import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import Page from '#models/page'
import WebSetting from '#models/web_setting'
import { newUlid } from '#services/ulid_service'
import { WebSettingsService } from '#services/settings_service'

const webSettings = new WebSettingsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

/** A published builder page holding a single Login Form block. */
async function loginPage(overrides: Partial<Page> = {}) {
  return Page.create({
    id: newUlid(),
    title: 'Custom sign in',
    path: 'custom-sign-in',
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'BUILDER',
    content: {
      root: {},
      content: [{ type: 'LoginForm', props: { id: 'LoginForm-1', submitLabel: 'Enter' } }],
    },
    seo: {},
    ...overrides,
  } as never)
}

async function pointLoginAt(pageId: string) {
  await webSettings.applyPatches([
    { section: 'auth_pages', key: 'login_page_id', value: pageId },
  ])
}

/**
 * Ask for the Inertia payload rather than the rendered HTML.
 *
 * The page *name* is what these tests are about, and it is unambiguous in the
 * JSON. Grepping SSR markup would assert the block's styling by accident and
 * break the next time someone changes a class.
 */
function inertia(client: ApiClient, url: string) {
  return client.get(url).header('x-inertia', 'true').header('x-inertia-version', '1')
}

test.group('Auth page override', (group) => {
  group.each.setup(async () => resetDatabase())

  test('with no setting, the built-in sign-in page renders', async ({ client, assert }) => {
    const res = await inertia(client, '/login')
    res.assertStatus(200)
    assert.equal(res.body().component, 'auth/login')
  })

  test('a designated page replaces the built-in one', async ({ client, assert }) => {
    const page = await loginPage()
    await pointLoginAt(page.id)

    const res = await inertia(client, '/login')
    res.assertStatus(200)
    assert.equal(res.body().component, 'public/page_ssr')
    assert.equal(res.body().props.page.title, 'Custom sign in')
  })

  test('the override is never snapshotted under its own URL', async ({ client, assert }) => {
    // SSG is the mode where a snapshot would be written; it must not be, because
    // this render is happening at /login rather than at the page's own path.
    const page = await loginPage({ renderMode: 'SSG' } as Partial<Page>)
    await pointLoginAt(page.id)

    const res = await client.get('/login')
    res.assertStatus(200)
    assert.equal(res.header('cache-control'), 'no-store')

    await page.refresh()
    assert.isNull(page.renderedHtml)
  })

  test('a draft page falls back to the built-in screen', async ({ client, assert }) => {
    const page = await loginPage()
    await pointLoginAt(page.id)

    page.status = 'DRAFT'
    await page.save()

    const res = await inertia(client, '/login')
    res.assertStatus(200)
    assert.equal(res.body().component, 'auth/login')
  })

  test('a deleted page falls back rather than erroring', async ({ client, assert }) => {
    const page = await loginPage()
    await pointLoginAt(page.id)
    await page.delete()

    const res = await inertia(client, '/login')
    res.assertStatus(200)
    assert.equal(res.body().component, 'auth/login')
  })

  test('a stale page id falls back rather than erroring', async ({ client, assert }) => {
    await pointLoginAt('01JXXXXXXXXXXXXXXXXXXXXXXX')

    const res = await inertia(client, '/login')
    res.assertStatus(200)
    assert.equal(res.body().component, 'auth/login')
  })

  test('clearing the picker removes the setting row entirely', async ({ client, assert }) => {
    const page = await loginPage()
    await pointLoginAt(page.id)
    await webSettings.applyPatches([{ section: 'auth_pages', key: 'login_page_id', value: '' }])

    const row = await WebSetting.query()
      .where('section', 'auth_pages')
      .where('key', 'login_page_id')
      .whereNull('deleted_at')
      .first()
    assert.isNull(row)

    const res = await inertia(client, '/login')
    assert.equal(res.body().component, 'auth/login')
  })

  test('a page can opt out of the site header and footer', async ({ client, assert }) => {
    const withChrome = await loginPage()
    await pointLoginAt(withChrome.id)

    // Default: the site's default header/footer templates are resolved and sent.
    const before = await inertia(client, '/login')
    const seededHeader = before.body().props.page.header

    withChrome.hideHeader = true
    withChrome.hideFooter = true
    await withChrome.save()

    const after = await inertia(client, '/login')
    assert.isUndefined(after.body().props.page.header)
    assert.isUndefined(after.body().props.page.footer)

    // Guard against the assertion passing for the wrong reason — if the site
    // had no default header to begin with, "none" would prove nothing.
    assert.isDefined(seededHeader)
  })

  test('an override cannot open registration while it is switched off', async ({ client }) => {
    const page = await loginPage({ path: 'custom-sign-up' } as Partial<Page>)
    await webSettings.applyPatches([
      { section: 'auth_pages', key: 'register_page_id', value: page.id },
    ])

    // `registration_enabled` defaults to off, and the gate runs before the
    // override lookup — so this must still be a 404, not a designed page.
    const res = await client.get('/register')
    res.assertStatus(404)
  })
})
