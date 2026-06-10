import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Role from '#models/role'
import UserAuthService from '#services/user_auth_service'

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

  test('logged-in user is redirected from guest routes to dashboard', async ({ client, assert: a }) => {
    const admin = await adminUser()

    for (const path of ['/login', '/register', '/auth/login', '/auth/signup', '/auth/register']) {
      const res = await client.get(path).redirects(0).loginAs(admin)
      a.oneOf(res.status(), [302, 303])
      a.equal(res.header('location'), '/admin/dashboard')
    }
  })

  test('register creates user', async ({ client, assert: a }) => {
    const email = `newuser-${Date.now()}@example.com`
    const res = await client.post('/register').redirects(0).form({
      email,
      username: `user${Date.now()}`,
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
    })
    a.oneOf(res.status(), [302, 303])

    const user = await User.query().where('email', email).first()
    a.isNotNull(user)
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

    const res = await asUser(client, user).post('/api/admin/content').json({
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
