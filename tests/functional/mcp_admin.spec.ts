import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import ModulesService from '#services/modules_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

async function enableMcp() {
  await new ModulesService().setEnabled('mcp', true)
}

async function token(abilities: string[]): Promise<string> {
  const user = await admin()
  const t = await User.accessTokens.create(user, abilities, { name: 'test' })
  return t.value!.release()
}

const bearer = (t: string) => `Bearer ${t}`

test.group('MCP admin | token management', (group) => {
  group.each.setup(async () => resetDatabase())

  test('listing tokens needs mcp:manage', async ({ client }) => {
    await enableMcp()
    const anon = await client.get('/api/admin/mcp/tokens')
    anon.assertStatus(401)
  })

  test('create → list → revoke an MCP-scoped token', async ({ client, assert }) => {
    await enableMcp()
    const created = await client
      .post('/api/admin/mcp/tokens')
      .loginAs(await admin())
      .json({ name: 'Build bot', abilities: ['builder:read', 'builder:pages'] })
    created.assertStatus(201)
    const body = created.body()
    assert.exists(body.token) // one-time plaintext
    assert.deepEqual(body.abilities.sort(), ['builder:pages', 'builder:read'])
    const id = body.id

    const list = await client.get('/api/admin/mcp/tokens').loginAs(await admin())
    list.assertStatus(200)
    assert.isTrue(list.body().some((t: { id: string }) => t.id === id))

    const del = await client.delete(`/api/admin/mcp/tokens/${id}`).loginAs(await admin())
    del.assertStatus(200)
    const after = await client.get('/api/admin/mcp/tokens').loginAs(await admin())
    assert.isFalse(after.body().some((t: { id: string }) => t.id === id))
  })

  test('the token list only shows MCP-scoped tokens', async ({ client, assert }) => {
    await enableMcp()
    // A non-MCP token (content scope) must not appear on this page.
    await User.accessTokens.create(await admin(), ['content:read'], { name: 'content only' })
    await client
      .post('/api/admin/mcp/tokens')
      .loginAs(await admin())
      .json({ name: 'mcp one', abilities: ['builder:read'] })

    const list = await client.get('/api/admin/mcp/tokens').loginAs(await admin())
    const names = list.body().map((t: { name: string }) => t.name)
    assert.include(names, 'mcp one')
    assert.notInclude(names, 'content only')
  })

  test('cannot mint an ability outside the MCP set', async ({ client }) => {
    await enableMcp()
    const res = await client
      .post('/api/admin/mcp/tokens')
      .loginAs(await admin())
      .json({ name: 'bad', abilities: ['settings:manage'] })
    res.assertStatus(422)
  })
})

test.group('MCP admin | audit log', (group) => {
  group.each.setup(async () => resetDatabase())

  test('builder-API calls are recorded, denials included', async ({ client, assert }) => {
    await enableMcp()
    const readToken = await token(['builder:read'])

    // A successful read…
    const ok = await client.get('/api/mcp/v1/catalog').header('Authorization', bearer(readToken))
    ok.assertStatus(200)

    // …and a denied write (read token cannot create a page).
    const denied = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(readToken))
      .json({ title: 'X', path: '/x', content: { root: { props: {} }, content: [] } })
    denied.assertStatus(403)

    const audit = await client.get('/api/admin/mcp/audit').loginAs(await admin())
    audit.assertStatus(200)
    const rows = audit.body().data as Array<{ action: string; status: number; tokenName: string }>

    const read = rows.find((r) => r.action === 'catalog.read')
    assert.exists(read)
    assert.equal(read!.status, 200)

    const create = rows.find((r) => r.action === 'page.create')
    assert.exists(create)
    assert.equal(create!.status, 403)
  })
})
