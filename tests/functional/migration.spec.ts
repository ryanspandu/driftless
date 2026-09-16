import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import User from '#models/user'
import Role from '#models/role'
import Page from '#models/page'
import UserAuthService from '#services/user_auth_service'
import UsersService from '#services/users_service'
import { WebSettingsService } from '#services/settings_service'
import { collectUserPermissions } from '#services/permission_ability_service'
import { SELF_REGISTERED_ROLE } from '#database/seeder_constants'
import { newUlid } from '#services/ulid_service'
import { currentBuildId } from '#services/release'

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

function asUser(client: ApiClient, user: User) {
  return {
    get: (url: string) => client.get(url).loginAs(user),
    post: (url: string) => client.post(url).loginAs(user),
    put: (url: string) => client.put(url).loginAs(user),
    delete: (url: string) => client.delete(url).loginAs(user),
  }
}

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

test.group('Health', () => {
  test('health endpoint returns ok', async ({ client }) => {
    const res = await client.get('/health')
    res.assertStatus(200)
    res.assertBodyContains({ ok: true })
  })
})

test.group('Not found', (group) => {
  group.each.setup(async () => resetDatabase())

  test('unknown path renders 404 page', async ({ client }) => {
    const res = await client.get('/this-page-does-not-exist')
    res.assertStatus(404)
    res.assertTextIncludes('errors/not_found')
  })

  test('unknown api path returns json 404', async ({ client }) => {
    const res = await client.get('/api/this-endpoint-does-not-exist')
    res.assertStatus(404)
    res.assertBodyContains({ message: 'Not found' })
  })
})

test.group('Auth unauthenticated', (group) => {
  group.each.setup(async () => resetDatabase())

  test('me requires auth', async ({ client }) => {
    const res = await client.get('/api/me')
    res.assertStatus(401)
  })
})

test.group('Auth', (group) => {
  group.each.setup(async () => resetDatabase())

  test('authenticated me returns admin permissions', async ({ client }) => {
    const admin = await adminUser()
    await UserAuthService.verifyCredentialsForLogin(admin.email, 'Driftless#333')

    const me = await client.get('/api/me').loginAs(admin)
    me.assertStatus(200)
    me.assertBodyContains({ email: admin.email })
    me.assertBodyContains({ permissions: ['*'] })
  })

  test('login via email', async ({ client, assert: a }) => {
    const res = await client.post('/login').redirects(0).form({
      login: 'admin@driftless.local',
      password: 'Driftless#333',
    })
    a.oneOf(res.status(), [302, 303])
    a.match(res.header('location') ?? '', /\/admin/)
  })

  test('login via username', async ({ client, assert: a }) => {
    const res = await client.post('/login').redirects(0).form({
      login: 'johndoe',
      password: 'Driftless#333',
    })
    a.oneOf(res.status(), [302, 303])
    a.match(res.header('location') ?? '', /\/admin/)
  })

  test('logged-in user is redirected from guest routes to dashboard', async ({
    client,
    assert: a,
  }) => {
    const admin = await adminUser()

    for (const path of ['/login', '/register', '/auth/login', '/auth/signup', '/auth/register']) {
      const res = await client.get(path).redirects(0).loginAs(admin)
      a.oneOf(res.status(), [302, 303])
      a.equal(res.header('location'), '/admin/dashboard')
    }
  })

  test('register is closed unless an operator opens it', async ({ client, assert: a }) => {
    const email = `closed-${Date.now()}@example.com`
    const res = await client
      .post('/register')
      .redirects(0)
      .form({
        email,
        username: `user${Date.now()}`,
        password: 'password123',
      })

    // 404, not 403: a disabled signup endpoint should not advertise itself.
    res.assertStatus(404)
    a.isNull(await User.query().where('email', email).first())
  })

  test('register creates a user with no permissions when open', async ({ client, assert: a }) => {
    await new WebSettingsService().applyPatches([
      { section: 'app_config', key: 'registration_enabled', value: '1' },
    ])

    const email = `newuser-${Date.now()}@example.com`
    const res = await client
      .post('/register')
      .redirects(0)
      .form({
        email,
        username: `user${Date.now()}`,
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      })
    a.oneOf(res.status(), [302, 303])

    const user = await User.query().where('email', email).preload('roles').first()
    a.isNotNull(user)

    /**
     * The point of this assertion: self-registration used to attach `USER`,
     * which carries `content:create/read/update/delete`. Anyone who signed up
     * could write and delete site content. A self-registered account must
     * arrive with zero capability.
     */
    a.deepEqual(
      user!.roles.map((r) => r.name),
      [SELF_REGISTERED_ROLE]
    )
    const permissions = collectUserPermissions(user!)
    a.deepEqual(permissions, [])
  })

  test('signed-in accounts survive a password change by an admin', async ({ assert: a }) => {
    const admin = await adminUser()
    await new UsersService().update(admin.id, { password: 'RotatedPassword#1' })

    /**
     * `withAuthFinder` re-hashes any dirty password column on save, so hashing
     * in the service too stored a hash of a hash and the new password could
     * never be used to log in.
     */
    const reloaded = await adminUser()
    a.isTrue(await hash.verify(reloaded.password, 'RotatedPassword#1'))
  })
})

test.group('Content', (group) => {
  group.each.setup(async () => resetDatabase())

  test('CRUD and public read', async ({ client }) => {
    const admin = await adminUser()
    const api = asUser(client, admin)
    const slug = `hello-${Date.now()}`

    const create = await api.post('/api/admin/content').json({
      title: 'Hello',
      slug,
      body: '<p>World</p>',
      status: 'PUBLISHED',
    })
    create.assertStatus(201)
    const id = create.body().id

    const list = await api.get('/api/admin/content')
    list.assertStatus(200)
    list.assertBodyContains([{ title: 'Hello' }])

    const pub = await client.get(`/api/public/content/${slug}`)
    pub.assertStatus(200)
    pub.assertBodyContains({ title: 'Hello' })

    const del = await api.delete(`/api/admin/content/${id}`)
    del.assertStatus(200)
  })
})

test.group('RBAC', (group) => {
  group.each.setup(async () => resetDatabase())

  test('403 without permission', async ({ client }) => {
    const user = await User.create({
      email: `limited-${Date.now()}@example.com`,
      password: 'password123',
      status: 'ACTIVE',
    })
    const guestRole = await Role.query().where('name', 'GUEST').firstOrFail()
    await user.related('roles').sync([guestRole.id])

    const res = await asUser(client, user)
      .post('/api/admin/content')
      .json({
        title: 'Nope',
        slug: `nope-${Date.now()}`,
        body: 'x',
        status: 'DRAFT',
      })
    res.assertStatus(403)
  })
})

test.group('Public SEO', (group) => {
  group.each.setup(async () => resetDatabase())

  test('robots.txt and sitemap.xml', async ({ client }) => {
    const robots = await client.get('/robots.txt')
    robots.assertStatus(200)
    robots.assertTextIncludes('Disallow: /admin')
    robots.assertTextIncludes('Sitemap:')

    const sitemap = await client.get('/sitemap.xml')
    sitemap.assertStatus(200)
    sitemap.assertTextIncludes('<urlset')
    sitemap.assertTextIncludes('<loc>')
  })

  test('robots.txt: each AI-crawler toggle adds its own block', async ({ client, assert: a }) => {
    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'block_ai_training', value: '1' },
    ])
    let res = await client.get('/robots.txt')
    let body = res.text()
    a.include(body, 'User-agent: GPTBot')
    a.include(body, 'Disallow: /admin') // base rules still present
    a.notInclude(body, 'OAI-SearchBot')

    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'block_ai_training', value: '0' },
      { section: 'site_meta', key: 'block_ai_search', value: '1' },
    ])
    res = await client.get('/robots.txt')
    body = res.text()
    a.include(body, 'User-agent: OAI-SearchBot')
    a.notInclude(body, 'GPTBot')

    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'block_ai_search', value: '0' },
      { section: 'site_meta', key: 'block_ai_agents', value: '1' },
    ])
    res = await client.get('/robots.txt')
    body = res.text()
    a.include(body, 'User-agent: ChatGPT-User')
    a.notInclude(body, 'OAI-SearchBot')
  })

  test('robots.txt: a raw override is served verbatim and ignores the toggles', async ({
    client,
    assert: a,
  }) => {
    const override = 'User-agent: *\nDisallow: /secret\n'
    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'block_ai_training', value: '1' },
      { section: 'site_meta', key: 'custom_robots_txt', value: override },
    ])

    const res = await client.get('/robots.txt')
    res.assertStatus(200)
    a.equal(res.text(), override)
  })

  test('discourage_indexing: noindex meta + X-Robots-Tag on a public page', async ({
    client,
    assert: a,
  }) => {
    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'discourage_indexing', value: '1' },
    ])
    await Page.create({
      id: newUlid(),
      title: 'Discourage test',
      path: 'discourage-test',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
    } as never)

    const res = await client.get('/discourage-test')
    res.assertStatus(200)
    a.equal(res.header('x-robots-tag'), 'noindex, nofollow')
    a.include(res.text(), 'name="robots" content="noindex,nofollow"')
  })

  test('discourage_indexing: X-Robots-Tag also applies to a cached SSG snapshot', async ({
    client,
    assert: a,
  }) => {
    await Page.create({
      id: newUlid(),
      title: 'Discourage SSG test',
      path: 'discourage-ssg-test',
      status: 'PUBLISHED',
      renderMode: 'SSG',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
      // Rendered before the flag existed — the header must still show up live
      // on this cache-hit path even though the baked-in HTML predates it.
      renderedHtml: '<html><head></head><body>snapshot</body></html>',
      renderedBuild: currentBuildId(),
    } as never)

    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'discourage_indexing', value: '1' },
    ])

    const res = await client.get('/discourage-ssg-test')
    res.assertStatus(200)
    a.equal(res.header('x-robots-tag'), 'noindex, nofollow')
  })

  test('discourage_indexing: sitemap.xml has no entries', async ({ client, assert: a }) => {
    await new WebSettingsService().applyPatches([
      { section: 'site_meta', key: 'discourage_indexing', value: '1' },
    ])
    const res = await client.get('/sitemap.xml')
    res.assertStatus(200)
    const body = res.text()
    a.include(body, '<urlset')
    a.notInclude(body, '<loc>')
  })

  test('custom_robots_txt over 20,000 chars is rejected', async ({ client }) => {
    const admin = await adminUser()
    const res = await asUser(client, admin)
      .put('/api/admin/settings/web')
      .json({
        patches: [
          { section: 'site_meta', key: 'custom_robots_txt', value: 'x'.repeat(20_001) },
        ],
      })
    res.assertStatus(422)
  })

  test('toggling discourage_indexing invalidates cached SSG snapshots', async ({
    client,
    assert: a,
  }) => {
    await Page.create({
      id: newUlid(),
      title: 'Stale snapshot test',
      path: 'stale-snapshot-test',
      status: 'PUBLISHED',
      renderMode: 'SSG',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
      renderedHtml: '<html><head></head><body>stale</body></html>',
      renderedBuild: currentBuildId(),
    } as never)

    const admin = await adminUser()
    const put = await asUser(client, admin)
      .put('/api/admin/settings/web')
      .json({
        patches: [{ section: 'site_meta', key: 'discourage_indexing', value: '1' }],
      })
    put.assertStatus(200)

    // The stale snapshot must have been invalidated and freshly re-rendered
    // with the noindex tag baked in — not just served with a live header
    // slapped on top of old HTML.
    const res = await client.get('/stale-snapshot-test')
    res.assertStatus(200)
    a.include(res.text(), 'name="robots" content="noindex,nofollow"')
  })
})

test.group('CMS', (group) => {
  group.each.setup(async () => resetDatabase())

  test('collection create and record CRUD', async ({ client, assert: a }) => {
    const admin = await adminUser()
    const api = asUser(client, admin)
    const key = `articles_${Date.now()}`

    const col = await api.post('/api/admin/cms/collections').json({
      key,
      label: 'Articles',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT', required: true }],
    })
    col.assertStatus(201)

    const rec = await api.post(`/api/admin/cms/${key}/records`).json({
      data: { title: 'First article' },
      status: 'PUBLISHED',
    })
    rec.assertStatus(201)
    const id = rec.body().id
    a.isString(id)

    const show = await api.get(`/api/admin/cms/${key}/records/${id}`)
    show.assertStatus(200)
    show.assertBodyContains({ data: { title: 'First article' } })
    ;(await api.delete(`/api/admin/cms/${key}/records/${id}`)).assertStatus(200)
  })

  test('revision restore', async ({ client, assert: a }) => {
    const admin = await adminUser()
    const api = asUser(client, admin)
    const key = `revtest_${Date.now()}`

    await api.post('/api/admin/cms/collections').json({
      key,
      label: 'Rev Test',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT', required: true }],
    })

    const rec = await api.post(`/api/admin/cms/${key}/records`).json({
      data: { title: 'Version one' },
      status: 'PUBLISHED',
    })
    rec.assertStatus(201)
    const id = rec.body().id

    await api.put(`/api/admin/cms/${key}/records/${id}`).json({
      data: { title: 'Version two' },
      status: 'PUBLISHED',
    })

    const revisions = await api.get(`/api/admin/cms/${key}/records/${id}/revisions`)
    revisions.assertStatus(200)
    a.isAbove(revisions.body().length, 0)
    const revisionId = revisions.body().at(-1).id

    const restored = await api.post(
      `/api/admin/cms/${key}/records/${id}/revisions/${revisionId}/restore`
    )
    restored.assertStatus(200)
    restored.assertBodyContains({ data: { title: 'Version one' } })
  })
})
