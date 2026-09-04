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

/** Toggle the MCP module; `setEnabled` writes the row AND busts the cache the
 *  `moduleEnabled` middleware reads, so the change takes effect immediately. */
async function setMcpEnabled(enabled: boolean) {
  await new ModulesService().setEnabled('mcp', enabled)
}
const enableMcp = () => setMcpEnabled(true)

/** Mint a personal access token for the admin with the given abilities. */
async function token(abilities: string[]): Promise<string> {
  const user = await admin()
  const t = await User.accessTokens.create(user, abilities, { name: 'test' })
  return t.value!.release()
}

const bearer = (t: string) => `Bearer ${t}`

const validPage = {
  root: { props: {} },
  content: [{ type: 'Heading', props: { text: 'Hello', level: '1' } }],
}

test.group('MCP builder-API | auth + module gating', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the catalog needs a valid access token', async ({ client }) => {
    await enableMcp()
    const anon = await client.get('/api/mcp/v1/catalog')
    anon.assertStatus(401)
  })

  test('a disabled module hides the builder-API', async ({ client }) => {
    await setMcpEnabled(false)
    const t = await token(['builder:read'])
    const res = await client.get('/api/mcp/v1/catalog').header('Authorization', bearer(t))
    // moduleEnabled short-circuits before the controller runs.
    res.assertStatus(404)
  })

  test('a read token can fetch the block catalog', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client.get('/api/mcp/v1/catalog?type=page').header('Authorization', bearer(t))
    res.assertStatus(200)
    const body = res.body()
    assert.isArray(body.blocks)
    assert.isAbove(body.blocks.length, 0)

    // Core blocks are tagged module: null; module-contributed blocks name their
    // module (provenance). Every block carries the `module` field.
    const heading = body.blocks.find((b: { type: string }) => b.type === 'Heading')
    assert.exists(heading)
    assert.property(heading, 'module')
    assert.isNull(heading.module)

    const product = body.blocks.find((b: { type: string }) => b.type === 'ProductList')
    if (product) assert.equal(product.module, 'ecommerce')
  })
})

test.group('MCP builder-API | ability gating', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a read-only token cannot create a page (needs builder:pages)', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'X', path: '/nope', content: validPage })
    res.assertStatus(403)
  })

  test('a read-only token cannot create a collection (needs builder:collections)', async ({
    client,
  }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/collections')
      .header('Authorization', bearer(t))
      .json({ key: 'nope', label: 'Nope' })
    res.assertStatus(403)
  })
})

test.group('MCP builder-API | pages + validator', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create → publish makes a live page', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])

    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'MCP Landing', path: '/mcp-landing', content: validPage })
    created.assertStatus(201)
    const id = created.body().id
    assert.exists(id)

    const published = await client
      .post(`/api/mcp/v1/pages/${id}/publish`)
      .header('Authorization', bearer(t))
      .json({})
    published.assertStatus(200)
    published.assertBodyContains({ status: 'PUBLISHED' })

    // The public route now resolves it instead of 404ing.
    const live = await client.get('/mcp-landing')
    live.assertStatus(200)
  })

  test('the validator rejects an unknown block type (422)', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({
        title: 'Bad',
        path: '/bad',
        content: { root: { props: {} }, content: [{ type: 'NotARealBlock', props: {} }] },
      })
    res.assertStatus(422)
    res.assertBodyContains({ message: 'Invalid page content' })
  })

  test('validate endpoint reports issues without writing', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/pages/validate')
      .header('Authorization', bearer(t))
      .json({ content: { root: { props: {} }, content: [{ type: 'Ghost', props: {} }] } })
    res.assertStatus(200)
    const body = res.body()
    assert.isFalse(body.valid)
    assert.isAbove(body.issues.length, 0)
  })
})
