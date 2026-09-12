import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Module from '#models/module'
import Page from '#models/page'
import WebSetting from '#models/web_setting'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  await new ModulesService().setEnabled('mcp', true)
  new ModulesService().bustCache()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

async function token(abilities: string[]): Promise<string> {
  const t = await User.accessTokens.create(await admin(), abilities, { name: 'test' })
  return t.value!.release()
}
const bearer = (t: string) => `Bearer ${t}`

async function enableEcommerce() {
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  new ModulesService().bustCache()
}

async function builderPage(
  status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
  kind: 'BUILDER' | 'CODE' = 'BUILDER'
) {
  return Page.create({
    id: newUlid(),
    title: 'Archive',
    path: `archive-${newUlid().slice(-6)}`,
    status,
    renderMode: 'SSR',
    kind,
    content: { root: {}, content: [] },
    seo: {},
  } as never)
}

test.group('MCP | use_page_as_role', (group) => {
  group.each.setup(async () => resetDatabase())

  test('assigns a builder page to the category archive slot', async ({ client, assert }) => {
    const page = await builderPage()
    const t = await token(['builder:settings'])
    const res = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'categoryArchive', pageId: page.id })
    res.assertStatus(200)

    const row = await WebSetting.query()
      .where('section', 'content_pages')
      .where('key', 'category_archive_page_id')
      .whereNull('deleted_at')
      .first()
    assert.equal(row!.value, page.id)
  })

  test('accepts a PUBLISHED code/kit page (not builder-only)', async ({ client, assert }) => {
    const page = await builderPage('PUBLISHED', 'CODE')
    const t = await token(['builder:settings'])
    const res = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'categoryArchive', pageId: page.id })
    res.assertStatus(200)
    const row = await WebSetting.query()
      .where('section', 'content_pages')
      .where('key', 'category_archive_page_id')
      .whereNull('deleted_at')
      .first()
    assert.equal(row!.value, page.id)
  })

  test('clears the slot when pageId is empty', async ({ client, assert }) => {
    const page = await builderPage()
    const t = await token(['builder:settings'])
    const set = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'tagArchive', pageId: page.id })
    set.assertStatus(200)
    const clear = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'tagArchive', pageId: '' })
    assert.equal(clear.status(), 200, `clear body: ${JSON.stringify(clear.body())}`)

    const row = await WebSetting.query()
      .where('section', 'content_pages')
      .where('key', 'tag_archive_page_id')
      .whereNull('deleted_at')
      .first()
    assert.isNull(row, row ? `row still present with value=${JSON.stringify(row.value)}` : '')
  })

  test('rejects a DRAFT page and an unknown role', async ({ client }) => {
    const t = await token(['builder:settings'])
    const draft = await builderPage('DRAFT')
    const bad = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'categoryArchive', pageId: draft.id })
    bad.assertStatus(422)

    const unknown = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'nope', pageId: '' })
    unknown.assertStatus(422)
  })

  test('a token without builder:settings is refused', async ({ client }) => {
    const t = await token(['builder:read'])
    const res = await client
      .put('/api/mcp/v1/page-roles')
      .header('Authorization', bearer(t))
      .json({ role: 'categoryArchive', pageId: '' })
    res.assertStatus(403)
  })
})

test.group('MCP | set_storefront_page', (group) => {
  group.each.setup(async () => resetDatabase())

  test('assigns a builder page to the ecommerce category archive', async ({ client, assert }) => {
    await enableEcommerce()
    const page = await builderPage()
    const t = await token(['builder:settings'])
    const res = await client
      .put('/api/mcp/v1/storefront-pages')
      .header('Authorization', bearer(t))
      .json({ slot: 'category', pageId: page.id })
    res.assertStatus(200)
    assert.equal(res.body().pageId, page.id)
  })

  test('404s when the ecommerce module is off', async ({ client }) => {
    const t = await token(['builder:settings'])
    const res = await client
      .put('/api/mcp/v1/storefront-pages')
      .header('Authorization', bearer(t))
      .json({ slot: 'category', pageId: '' })
    res.assertStatus(404)
  })
})
