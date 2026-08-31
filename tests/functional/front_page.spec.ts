import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import { WebSettingsService } from '#services/settings_service'

const webSettings = new WebSettingsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function setFrontPage(value: string) {
  await webSettings.applyPatches([{ section: 'home_page', key: 'front_page_id', value }])
}

/** Inertia payload — the component *name* is what these tests assert. */
function inertia(client: ApiClient, url: string) {
  return client.get(url).header('x-inertia', 'true').header('x-inertia-version', '1')
}

test.group('Front page override', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the seeded landing builder page renders at / by default', async ({ client, assert }) => {
    const res = await inertia(client, '/')
    res.assertStatus(200)
    assert.equal(res.body().component, 'public/page_ssr')
  })

  test('with no front page set, the built-in static landing renders', async ({ client, assert }) => {
    await setFrontPage('') // clears the seeded default (empty deletes the row)
    const res = await inertia(client, '/')
    res.assertStatus(200)
    assert.equal(res.body().component, 'home')
  })

  test('a draft front page falls back to the built-in landing', async ({ client, assert }) => {
    const draft = await Page.create({
      id: newUlid(),
      title: 'Draft home',
      path: 'draft-home',
      status: 'DRAFT',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
    } as never)
    await setFrontPage(draft.id)
    const res = await inertia(client, '/')
    res.assertStatus(200)
    assert.equal(res.body().component, 'home')
  })

  test('a stale front page id falls back to the built-in landing', async ({ client, assert }) => {
    await setFrontPage(newUlid()) // an id that does not exist
    const res = await inertia(client, '/')
    res.assertStatus(200)
    assert.equal(res.body().component, 'home')
  })

  test('landing disabled redirects to /login even when a front page is set', async ({ client }) => {
    await webSettings.applyPatches([{ section: 'app_config', key: 'landing_enabled', value: '0' }])
    const res = await client.get('/').redirects(0)
    res.assertStatus(302)
    res.assertHeader('location', '/login')
  })
})
