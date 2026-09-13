import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Role from '#models/role'
import Page from '#models/page'
import Content from '#models/content'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import CmsService from '#services/cms_service'
import { WebSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'

const webSettings = new WebSettingsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

async function adminId(): Promise<number> {
  const u = await adminUser()
  return u.id
}

/** A self-registered-style member: MEMBER role, zero permissions. */
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

/** Ask for the Inertia payload (component + props) rather than the rendered HTML. */
function inertia(client: ApiClient, url: string) {
  return client.get(url).header('x-inertia', 'true').header('x-inertia-version', '1')
}

const SECRET = 'SECRET_BODY_MARKER_9137'

test.group('Content visibility — service + encryption', (group) => {
  group.each.setup(async () => resetDatabase())

  test('PROTECTED post encrypts the password and never leaks it', async ({ assert }) => {
    const authorId = await adminId()
    const dto = await new ContentService().create(authorId, {
      title: 'Secret',
      slug: 'secret',
      body: `<p>${SECRET}</p>`,
      status: 'PUBLISHED',
      visibility: 'PROTECTED',
      password: 'hunter2',
    })

    assert.equal(dto.visibility, 'PROTECTED')
    assert.isTrue(dto.hasPassword)
    // The DTO never carries the password or its ciphertext.
    assert.notProperty(dto as unknown as Record<string, unknown>, 'password')
    assert.notProperty(dto as unknown as Record<string, unknown>, 'passwordEnc')

    // Stored as ciphertext, not plaintext.
    const row = await Content.findOrFail(dto.id)
    assert.isNotNull(row.passwordEnc)
    assert.notInclude(row.passwordEnc!, 'hunter2')

    const svc = new ContentService()
    assert.isTrue(await svc.verifyPostPassword('secret', 'hunter2'))
    assert.isFalse(await svc.verifyPostPassword('secret', 'wrong'))
    assert.equal(await svc.revealPassword(dto.id), 'hunter2')
  })

  test('creating a PROTECTED post without a password is rejected', async ({ assert }) => {
    const authorId = await adminId()
    await assert.rejects(() =>
      new ContentService().create(authorId, {
        title: 'No pw',
        slug: 'no-pw',
        body: '<p>x</p>',
        status: 'PUBLISHED',
        visibility: 'PROTECTED',
      })
    )
  })

  test('switching away from PROTECTED clears the stored password', async ({ assert }) => {
    const authorId = await adminId()
    const svc = new ContentService()
    const dto = await svc.create(authorId, {
      title: 'T',
      slug: 't',
      body: '<p>x</p>',
      status: 'PUBLISHED',
      visibility: 'PROTECTED',
      password: 'pw',
    })
    await svc.update(dto.id, { visibility: 'PUBLIC' })
    const row = await Content.findOrFail(dto.id)
    assert.isNull(row.passwordEnc)
  })

  test('findPublishedBySlug withholds the body when includeSecret is false', async ({ assert }) => {
    const authorId = await adminId()
    const svc = new ContentService()
    await svc.create(authorId, {
      title: 'Gated',
      slug: 'gated',
      body: `<p>${SECRET}</p>`,
      status: 'PUBLISHED',
      visibility: 'MEMBER',
    })
    const open = await svc.findPublishedBySlug('gated', true)
    assert.include(open.body, SECRET)
    const withheld = await svc.findPublishedBySlug('gated', false)
    assert.equal(withheld.body, '')
    assert.isNull(withheld.data)
    assert.equal(withheld.visibility, 'MEMBER')
  })

  test('the CONTENT collection cannot define a "visibility" field', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createCollection({ key: 'article_meta', label: 'Article meta', type: 'CONTENT' })
    await assert.rejects(() =>
      cms.addField('article_meta', { key: 'visibility', label: 'Visibility', type: 'TEXT' })
    )
  })
})

test.group('Content visibility — public gate', (group) => {
  group.each.setup(async () => resetDatabase())

  async function seed(visibility: 'PUBLIC' | 'PROTECTED' | 'MEMBER', password?: string) {
    const authorId = await adminId()
    return new ContentService().create(authorId, {
      title: 'Post',
      slug: 'post',
      body: `<p>${SECRET}</p>`,
      status: 'PUBLISHED',
      visibility,
      password,
    })
  }

  test('a PUBLIC post ships its body to anyone', async ({ client, assert }) => {
    await seed('PUBLIC')
    const res = await inertia(client, '/posts/post')
    res.assertStatus(200)
    assert.equal(res.body().component, 'posts/show')
    assert.include(res.body().props.post.body, SECRET)
    assert.isNull(res.body().props.locked)
    assert.match(res.body().props.canonicalUrl, /\/posts\/post$/)
  })

  test('a PROTECTED post withholds the body and asks for a password', async ({
    client,
    assert,
  }) => {
    await seed('PROTECTED', 'hunter2')
    const res = await inertia(client, '/posts/post')
    res.assertStatus(200)
    assert.equal(res.body().props.locked.type, 'password')
    assert.notInclude(String(res.body().props.post.body), SECRET)
  })

  test('an admin bypasses the password gate', async ({ client, assert }) => {
    await seed('PROTECTED', 'hunter2')
    const admin = await adminUser()
    const res = await inertia(client, '/posts/post').loginAs(admin)
    res.assertStatus(200)
    assert.isNull(res.body().props.locked)
    assert.include(res.body().props.post.body, SECRET)
  })

  test('a MEMBER post is withheld from anonymous visitors', async ({ client, assert }) => {
    await seed('MEMBER')
    const res = await inertia(client, '/posts/post')
    res.assertStatus(200)
    assert.equal(res.body().props.locked.type, 'member')
    assert.notInclude(String(res.body().props.post.body), SECRET)
  })

  test('a MEMBER post is shown to a logged-in member', async ({ client, assert }) => {
    await seed('MEMBER')
    const member = await memberUser()
    const res = await inertia(client, '/posts/post').loginAs(member)
    res.assertStatus(200)
    assert.isNull(res.body().props.locked)
    assert.include(res.body().props.post.body, SECRET)
  })

  test('the correct password unlocks the post; a wrong one does not', async ({
    client,
    assert,
  }) => {
    await seed('PROTECTED', 'hunter2')

    const wrong = await client.post('/posts/post/unlock').form({ password: 'nope' }).redirects(0)
    // Redirect back, no unlock cookie granting access.
    assert.isTrue(wrong.status() >= 300 && wrong.status() < 400)

    const ok = await client.post('/posts/post/unlock').form({ password: 'hunter2' }).redirects(0)
    assert.isTrue(ok.status() >= 300 && ok.status() < 400)
    const cookie = ok.cookies()['dl_unlocked']
    assert.isDefined(cookie)

    // Replay the unlock cookie: the body now ships.
    const res = await inertia(client, '/posts/post').cookie('dl_unlocked', cookie.value)
    assert.isNull(res.body().props.locked)
    assert.include(res.body().props.post.body, SECRET)
  })
})

test.group('Content archive overrides', (group) => {
  group.each.setup(async () => resetDatabase())

  async function archivePage() {
    return Page.create({
      id: newUlid(),
      title: 'Custom category archive',
      path: 'custom-category-archive',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
    } as never)
  }

  test('a designated page replaces the built-in category archive', async ({ client, assert }) => {
    const cat = await new ContentCategoryService().create({ name: 'News', slug: 'news' })
    assert.equal(cat.slug, 'news')

    // Default: the built-in Inertia archive.
    const before = await inertia(client, '/category/news')
    before.assertStatus(200)
    assert.equal(before.body().component, 'posts/category')

    // Assign a builder page as the archive template.
    const page = await archivePage()
    await webSettings.applyPatches([
      { section: 'content_pages', key: 'category_archive_page_id', value: page.id },
    ])

    const after = await inertia(client, '/category/news')
    after.assertStatus(200)
    // The builder page renders instead of the Inertia archive; its SEO title is
    // overridden to the category name via `seoOverride`.
    assert.equal(after.body().component, 'public/page_ssr')
    assert.equal(after.body().props.page.title, 'News')
  })

  test('a draft override falls back to the built-in archive', async ({ client, assert }) => {
    await new ContentCategoryService().create({ name: 'News', slug: 'news' })
    const page = await archivePage()
    page.status = 'DRAFT'
    await page.save()
    await webSettings.applyPatches([
      { section: 'content_pages', key: 'category_archive_page_id', value: page.id },
    ])

    const res = await inertia(client, '/category/news')
    assert.equal(res.body().component, 'posts/category')
  })
})
