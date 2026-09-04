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

// Mirrors `mcpWriteThrottle`: 30 writes per minute per token.
const WRITE_LIMIT = 30

test.group('MCP builder-API | write rate limit', (group) => {
  group.each.setup(async () => resetDatabase())

  test('mutations are capped stricter than the overall budget', async ({ client, assert }) => {
    await enableMcp()
    // A read-only token: each POST passes auth + the throttle, then 403s at the
    // ability check — so the write throttle counts it without touching the DB.
    const t = await token(['builder:read'])

    const body = { title: 'x', path: '/x', content: { root: { props: {} }, content: [] } }

    for (let i = 0; i < WRITE_LIMIT; i++) {
      const res = await client
        .post('/api/mcp/v1/pages')
        .header('Authorization', bearer(t))
        .json(body)
      assert.notEqual(res.status(), 429, `request ${i + 1} should not be throttled yet`)
    }

    // The next mutation exceeds the write budget.
    const blocked = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json(body)
    blocked.assertStatus(429)
  })

  test('reads are not limited by the write budget', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])

    // Well past the write limit — GETs must all succeed (the write throttle
    // skips them; the overall 120/min budget is not reached).
    for (let i = 0; i < WRITE_LIMIT + 5; i++) {
      const res = await client.get('/api/mcp/v1/catalog').header('Authorization', bearer(t))
      assert.equal(res.status(), 200, `read ${i + 1} should not be throttled`)
    }
  })
})
