import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'

/**
 * `create_page`/`update_page` must REJECT a path under a reserved first segment
 * (`shop/...`, `admin/...`, `api/...`) instead of silently saving a page that can
 * never render — a fixed route (a module's own, or core's) always wins at that
 * URL ahead of the CMS catch-all. See `app/services/reserved_paths.ts`.
 */

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

const validPage = { root: { props: {} }, content: [] }

test.group('Pages — reserved-path rejection', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create_page rejects a path under the "shop" reserved segment', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:read', 'builder:pages'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'My cart', path: 'shop/cart', content: validPage })
    res.assertStatus(422)
    assert.include(res.body().message, 'reserved segment "shop"')
    assert.include(res.body().message, 'set_storefront_page')
  })

  test('create_page rejects a path under the "admin" reserved segment', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:read', 'builder:pages'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'Sneaky', path: 'admin/sneaky', content: validPage })
    res.assertStatus(422)
    assert.include(res.body().message, 'reserved segment "admin"')
  })

  test('create_page still accepts a normal, non-reserved path', async ({ client, assert }) => {
    const t = await token(['builder:read', 'builder:pages'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'Kit demo', path: 'kit-demo/my-cart', content: validPage })
    res.assertStatus(201)
    assert.exists(res.body().id)
  })

  test('update_page rejects moving an existing page to a reserved path', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:read', 'builder:pages'])
    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'Movable', path: `movable-${newUlid().slice(-6)}`, content: validPage })
    created.assertStatus(201)
    const id = created.body().id

    const moved = await client
      .put(`/api/mcp/v1/pages/${id}`)
      .header('Authorization', bearer(t))
      .json({ path: 'shop/checkout' })
    moved.assertStatus(422)
    assert.include(moved.body().message, 'reserved segment "shop"')
  })

  test('update_page leaving the path unchanged does not re-trigger the reserved check', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:read', 'builder:pages'])
    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'Stable', path: `stable-${newUlid().slice(-6)}`, content: validPage })
    created.assertStatus(201)
    const id = created.body().id

    const renamed = await client
      .put(`/api/mcp/v1/pages/${id}`)
      .header('Authorization', bearer(t))
      .json({ title: 'Stable (renamed)' })
    renamed.assertStatus(200)
    assert.equal(renamed.body().title, 'Stable (renamed)')
  })
})
