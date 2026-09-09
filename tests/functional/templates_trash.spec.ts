import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Template from '#models/template'
import TemplatesService from '#services/templates_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const svc = new TemplatesService()

async function makeTemplate(name = 'Header A') {
  return svc.create({ name, type: 'HEADER', content: { root: {}, content: [] } } as never)
}

test.group('Templates trash', (group) => {
  group.each.setup(async () => resetDatabase())
  group.each.timeout(30_000)

  test('remove soft-deletes; the row leaves the list and enters the trash', async ({ assert }) => {
    const t = await makeTemplate()
    await svc.remove(t.id)

    const list = await svc.list('HEADER')
    assert.isEmpty(list.filter((r) => r.id === t.id))

    const trashed = await svc.findTrashed()
    assert.isNotEmpty(trashed.filter((r) => r.id === t.id))

    const row = await Template.find(t.id)
    assert.isNotNull(row!.deletedAt)
  })

  test('restore brings it back to the list', async ({ assert }) => {
    const t = await makeTemplate()
    await svc.remove(t.id)
    await svc.restore(t.id)

    const list = await svc.list('HEADER')
    assert.isNotEmpty(list.filter((r) => r.id === t.id))
    const row = await Template.find(t.id)
    assert.isNull(row!.deletedAt)
    assert.isEmpty((await svc.findTrashed()).filter((r) => r.id === t.id))
  })

  test('force-delete permanently removes a trashed template', async ({ assert }) => {
    const t = await makeTemplate()
    await svc.remove(t.id)
    await svc.forceDelete(t.id)
    assert.isNull(await Template.find(t.id))
  })

  test('restore and force only touch trashed rows', async ({ assert }) => {
    const t = await makeTemplate()
    // Not trashed → both should reject.
    await assert.rejects(() => svc.restore(t.id))
    await assert.rejects(() => svc.forceDelete(t.id))
  })

  test('trash/restore/force are reachable over HTTP', async ({ client, assert }) => {
    const { default: User } = await import('#models/user')
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()
    const t = await makeTemplate('Footer X')

    const del = await client.delete(`/api/admin/templates/${t.id}`).loginAs(admin)
    del.assertStatus(200)

    const trash = await client.get('/api/admin/templates/trash').loginAs(admin)
    trash.assertStatus(200)
    assert.isNotEmpty((trash.body() as Array<{ id: string }>).filter((r) => r.id === t.id))

    const restore = await client.post(`/api/admin/templates/${t.id}/restore`).loginAs(admin)
    restore.assertStatus(200)

    await client.delete(`/api/admin/templates/${t.id}`).loginAs(admin)
    const force = await client.delete(`/api/admin/templates/${t.id}/force`).loginAs(admin)
    force.assertStatus(200)
    assert.isNull(await Template.find(t.id))
  })
})
