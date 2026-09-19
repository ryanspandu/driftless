import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Page from '#models/page'
import WebSetting from '#models/web_setting'
import ModulesService from '#services/modules_service'
import ContentPathsService from '#services/content_paths_service'
import { newUlid } from '#services/ulid_service'

/**
 * MCP `get_content_paths` / `set_content_paths` — where the built-in blog screens
 * live. The API is thin over `WebSettingsService.applyPatches`, which owns the
 * validation (reserved segments, pages, collections, the other moved screens).
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

const URL_PATH = '/api/mcp/v1/content-paths'

const DEFAULTS = { postsArchive: 'blog', postDetail: 'posts', category: 'category', tag: 'tag' }

async function storedRow(key: string) {
  return WebSetting.query()
    .where('section', 'content_paths')
    .where('key', key)
    .whereNull('deleted_at')
    .first()
}

test.group('MCP | get_content_paths / set_content_paths', (group) => {
  group.each.setup(async () => resetDatabase())

  test('GET returns the defaults, their defaults block and example URLs', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:read'])
    const res = await client.get(URL_PATH).header('Authorization', bearer(t))
    res.assertStatus(200)
    const body = res.body()
    assert.include(body, DEFAULTS)
    assert.deepEqual(body.defaults, DEFAULTS)
    assert.equal(body.examples.archive, '/blog')
    assert.equal(body.examples.detail, '/posts/my-post')
    assert.match(body.examples.category, /^\/category\/[a-z0-9-]+$/)
    assert.match(body.examples.tag, /^\/tag\/[a-z0-9-]+$/)
  })

  test('PUT moves the blog; GET, the service and the examples all follow', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:read', 'builder:settings'])
    const put = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postsArchive: 'insights', postDetail: 'insights' })
    put.assertStatus(200)
    assert.equal(put.body().postsArchive, 'insights')
    assert.equal(put.body().postDetail, 'insights')
    assert.equal(put.body().category, 'category', 'a field that was not sent is untouched')
    assert.equal(put.body().examples.archive, '/insights')
    assert.equal(put.body().examples.detail, '/insights/my-post')
    assert.deepEqual(put.body().defaults, DEFAULTS)

    const get = await client.get(URL_PATH).header('Authorization', bearer(t))
    assert.equal(get.body().postsArchive, 'insights')
    assert.equal(get.body().postDetail, 'insights')

    const effective = await new ContentPathsService().get()
    assert.deepEqual(effective, {
      archive: 'insights',
      detail: 'insights',
      category: 'category',
      tag: 'tag',
    })
  })

  test('PUT normalises the value (case, slashes) and accepts a nested prefix', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:settings'])
    const res = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postsArchive: ' /Resources/Insights/ ' })
    res.assertStatus(200)
    assert.equal(res.body().postsArchive, 'resources/insights')
    const effective = await new ContentPathsService().get()
    assert.equal(effective.archive, 'resources/insights')
  })

  test('a reserved segment is rejected with 422 and nothing is stored', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:settings'])
    const res = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postsArchive: 'admin' })
    res.assertStatus(422)
    assert.match(res.body().message, /reserved/i)
    assert.isNull(await storedRow('posts_archive_prefix'))
    const effective = await new ContentPathsService().get()
    assert.equal(effective.archive, 'blog')
  })

  test('a malformed prefix is rejected with 422', async ({ client, assert }) => {
    const t = await token(['builder:settings'])
    const res = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ tag: 'not valid!' })
    res.assertStatus(422)
    assert.match(res.body().message, /not a valid URL prefix/)
  })

  test('an empty string (and null) resets that screen to its default', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:settings'])
    const set = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postsArchive: 'insights', tag: 'topics' })
    set.assertStatus(200)
    assert.isNotNull(await storedRow('posts_archive_prefix'))

    // The body parser turns '' into null; both must mean "reset".
    const reset = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postsArchive: '' })
    reset.assertStatus(200)
    assert.equal(reset.body().postsArchive, 'blog')
    assert.equal(reset.body().tag, 'topics', 'the other screen keeps its value')
    assert.isNull(await storedRow('posts_archive_prefix'), 'a default is stored as no row')

    const nulled = await client.put(URL_PATH).header('Authorization', bearer(t)).json({ tag: null })
    nulled.assertStatus(200)
    assert.equal(nulled.body().tag, 'tag')
  })

  test('a body with none of the four fields is 422 "Nothing to update"', async ({
    client,
    assert,
  }) => {
    const t = await token(['builder:settings'])
    const res = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ somethingElse: 'x' })
    res.assertStatus(422)
    assert.equal(res.body().message, 'Nothing to update')
  })

  test('a page already living under the prefix makes the move 422', async ({ client, assert }) => {
    await Page.create({
      id: newUlid(),
      title: 'Insights hello',
      path: 'insights/hello',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
    } as never)
    const t = await token(['builder:settings'])
    const res = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postsArchive: 'insights' })
    res.assertStatus(422)
    assert.match(res.body().message, /page already exists/)
    const effective = await new ContentPathsService().get()
    assert.equal(effective.archive, 'blog')
  })

  test("reusing a moved screen's old address is rejected (422)", async ({ client, assert }) => {
    const t = await token(['builder:settings'])
    const first = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ postDetail: 'articles' })
    first.assertStatus(200)
    // "posts" is the moved post screen's old address (it would 301 there).
    const clash = await client
      .put(URL_PATH)
      .header('Authorization', bearer(t))
      .json({ tag: 'posts' })
    clash.assertStatus(422)
    assert.match(clash.body().message, /old address/)
  })

  test('a token without builder:settings cannot write; without builder:read cannot read', async ({
    client,
  }) => {
    const readOnly = await token(['builder:read'])
    const put = await client
      .put(URL_PATH)
      .header('Authorization', bearer(readOnly))
      .json({ postsArchive: 'insights' })
    put.assertStatus(403)

    const settingsOnly = await token(['builder:settings'])
    const get = await client.get(URL_PATH).header('Authorization', bearer(settingsOnly))
    get.assertStatus(403)

    const anon = await client.get(URL_PATH)
    anon.assertStatus(401)
  })
})
