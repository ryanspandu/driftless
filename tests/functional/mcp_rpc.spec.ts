import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient } from '@japa/api-client'
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

/** POST one JSON-RPC message to the in-app MCP endpoint. */
function rpc(client: ApiClient, tok: string, message: Record<string, unknown>) {
  return client
    .post('/api/mcp/v1/rpc')
    .header('Authorization', `Bearer ${tok}`)
    .header('Accept', 'application/json, text/event-stream')
    .json(message)
}

const callTool = (name: string, args: Record<string, unknown>) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
})

/** The tool result text is JSON stringified inside result.content[0].text. */
function toolText(body: { result?: { content?: Array<{ text: string }>; isError?: boolean } }) {
  return {
    isError: Boolean(body.result?.isError),
    text: body.result?.content?.[0]?.text ?? '',
  }
}

const validPage = {
  root: { props: {} },
  content: [{ type: 'Heading', props: { text: 'Hello', level: '1' } }],
}

test.group('MCP in-app RPC | handshake + discovery', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the endpoint needs a valid token', async ({ client }) => {
    await enableMcp()
    const res = await client
      .post('/api/mcp/v1/rpc')
      .header('Accept', 'application/json, text/event-stream')
      .json({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
    res.assertStatus(401)
  })

  test('initialize + tools/list work', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])

    const init = await rpc(client, t, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'c', version: '1' },
      },
    })
    init.assertStatus(200)
    assert.exists(init.body().result.protocolVersion)

    const list = await rpc(client, t, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    list.assertStatus(200)
    const names = list.body().result.tools.map((x: { name: string }) => x.name)
    assert.include(names, 'get_block_catalog')
    assert.include(names, 'create_page')
    assert.include(names, 'publish_page')
  })

  test('get_block_catalog forwards to the builder-API', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await rpc(client, t, callTool('get_block_catalog', { type: 'page' }))
    res.assertStatus(200)
    const { isError, text } = toolText(res.body())
    assert.isFalse(isError)
    assert.include(text, 'Heading')
  })
})

test.group('MCP in-app RPC | tools honour the same guards', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create_page + publish_page through the RPC makes a live page', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])

    const created = await rpc(
      client,
      t,
      callTool('create_page', { title: 'RPC Landing', path: '/rpc-landing', content: validPage })
    )
    created.assertStatus(200)
    const createdOut = toolText(created.body())
    assert.isFalse(createdOut.isError)
    const page = JSON.parse(createdOut.text)
    assert.exists(page.id)

    const published = await rpc(client, t, callTool('publish_page', { id: page.id }))
    const pubOut = toolText(published.body())
    assert.isFalse(pubOut.isError)
    assert.equal(JSON.parse(pubOut.text).status, 'PUBLISHED')

    const live = await client.get('/rpc-landing')
    live.assertStatus(200)
  })

  test('a token without builder:pages cannot create a page (forwarded 403)', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await rpc(
      client,
      t,
      callTool('create_page', { title: 'X', path: '/nope', content: validPage })
    )
    const out = toolText(res.body())
    assert.isTrue(out.isError)
    assert.include(out.text, '403')
  })

  test('the validator still rejects unknown blocks (forwarded 422)', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const res = await rpc(
      client,
      t,
      callTool('create_page', {
        title: 'Bad',
        path: '/bad',
        content: { root: { props: {} }, content: [{ type: 'NotARealBlock', props: {} }] },
      })
    )
    const out = toolText(res.body())
    assert.isTrue(out.isError)
    assert.include(out.text, '422')
  })
})
