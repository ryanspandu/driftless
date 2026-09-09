import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Role from '#models/role'
import TemplateKitState from '#models/template_kit_state'
import TemplateKitsService from '#services/template_kits_service'

/** A kit that ships both code-templates (header/footer) and file-pages. */
const KIT = 'aftrn-web'
/** A file-page path contributed by that kit. */
const KIT_PAGE_PATH = 'aftrn'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  // The active-kit set is cached process-wide (10s TTL); truncate doesn't clear
  // it, so bust it between tests to avoid one test's toggle bleeding into another.
  new TemplateKitsService().bustActiveCache()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/** A signed-in user with the MEMBER role — zero permissions. */
async function memberUser() {
  const role = await Role.query().where('name', 'MEMBER').firstOrFail()
  const user = await User.create({
    email: `member-${Date.now()}@example.com`,
    password: 'password123',
    username: `member${Date.now()}`,
    status: 'ACTIVE',
  })
  await user.related('roles').attach([role.id])
  return user
}

test.group('Template kit activation', (group) => {
  group.each.setup(async () => resetDatabase())
  // Some cases render a full page (public file-page route), which is slow under
  // a shared test run — give them headroom over the 2s default.
  group.each.timeout(30_000)

  test("a kit's templates and file-pages are hidden while inactive (default)", async ({
    client,
    assert,
  }) => {
    const admin = await adminUser()

    const templates = await client.get('/api/admin/templates?code=1').loginAs(admin)
    templates.assertStatus(200)
    const codeIds = (templates.body() as Array<{ id: string }>).map((t) => t.id)
    assert.isEmpty(codeIds.filter((id) => id.startsWith(`codetpl:${KIT}/`)))

    const pages = await client.get('/api/admin/pages').loginAs(admin)
    pages.assertStatus(200)
    const fileIds = (pages.body() as Array<{ id: string }>).map((p) => p.id)
    assert.isEmpty(fileIds.filter((id) => id.startsWith(`file:${KIT}/`)))
  })

  test('activating a kit surfaces its templates + file-pages instantly', async ({
    client,
    assert,
  }) => {
    const admin = await adminUser()

    const on = await client
      .put(`/api/admin/template-kits/${KIT}/active`)
      .loginAs(admin)
      .json({ active: true })
    on.assertStatus(200)

    // The DB row is the source of truth.
    const row = await TemplateKitState.find(KIT)
    assert.isTrue(row?.active)

    const templates = await client.get('/api/admin/templates?code=1').loginAs(admin)
    const codeIds = (templates.body() as Array<{ id: string }>).map((t) => t.id)
    assert.isNotEmpty(codeIds.filter((id) => id.startsWith(`codetpl:${KIT}/`)))

    const pages = await client.get('/api/admin/pages').loginAs(admin)
    const fileIds = (pages.body() as Array<{ id: string }>).map((p) => p.id)
    assert.isNotEmpty(fileIds.filter((id) => id.startsWith(`file:${KIT}/`)))
  })

  test('deactivating hides them again and 404s the public file-page route', async ({
    client,
    assert,
  }) => {
    const admin = await adminUser()

    await client.put(`/api/admin/template-kits/${KIT}/active`).loginAs(admin).json({ active: true })
    const live = await client.get(`/${KIT_PAGE_PATH}`)
    assert.notEqual(live.status(), 404, 'an active kit file-page should route')

    await client
      .put(`/api/admin/template-kits/${KIT}/active`)
      .loginAs(admin)
      .json({ active: false })
    const gone = await client.get(`/${KIT_PAGE_PATH}`)
    gone.assertStatus(404)

    const pages = await client.get('/api/admin/pages').loginAs(admin)
    const fileIds = (pages.body() as Array<{ id: string }>).map((p) => p.id)
    assert.isEmpty(fileIds.filter((id) => id.startsWith(`file:${KIT}/`)))
  })

  test('an unknown kit cannot be toggled', async ({ client }) => {
    const admin = await adminUser()
    const res = await client
      .put('/api/admin/template-kits/not-a-real-kit/active')
      .loginAs(admin)
      .json({ active: true })
    res.assertStatus(422)
  })

  test('a user without settings:manage is refused', async ({ client }) => {
    const member = await memberUser()
    const res = await client
      .put(`/api/admin/template-kits/${KIT}/active`)
      .loginAs(member)
      .json({ active: true })
    res.assertStatus(403)
  })
})
