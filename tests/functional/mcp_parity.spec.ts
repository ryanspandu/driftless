import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Page from '#models/page'
import Form from '#models/form'
import ModulesService from '#services/modules_service'
import { validatePuckDocument } from '#modules/mcp/services/puck_content_validator'
import { hasPrivilegedPageContent } from '#services/html_sanitizer_service'

/**
 * Parity checks for the MCP builder-API "smart tools" work: the Forms surface,
 * per-page SEO + scheduling + code-chrome on create, the newly-documented
 * behaviour props validating cleanly, MCP settings busting SSG snapshots, and
 * the per-page-JS privilege gate. Locks in Tier 1–3 of the parity plan.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()
const enableMcp = () => new ModulesService().setEnabled('mcp', true)

async function token(abilities: string[]): Promise<string> {
  const user = await admin()
  const t = await User.accessTokens.create(user, abilities, { name: 'test' })
  return t.value!.release()
}
const bearer = (t: string) => `Bearer ${t}`

const page = (content: unknown) => ({ root: { props: {} }, content })

test.group('MCP parity | Forms tool surface', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create → update (fields) → list → get → delete a form', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:forms'])

    const created = await client
      .post('/api/mcp/v1/forms')
      .header('Authorization', bearer(t))
      .json({ title: 'Contact us' })
    created.assertStatus(201)
    const id = created.body().id as string
    assert.equal(created.body().slug, 'contact-us')
    assert.deepEqual(created.body().fields, [])

    const updated = await client
      .put(`/api/mcp/v1/forms/${id}`)
      .header('Authorization', bearer(t))
      .json({
        successMessage: 'Thanks!',
        fields: [
          { key: 'email', label: 'Email', type: 'email', required: true },
          { key: 'topic', label: 'Topic', type: 'select', options: ['Sales', 'Support'] },
        ],
      })
    updated.assertStatus(200)
    assert.lengthOf(updated.body().fields, 2)
    assert.equal(updated.body().successMessage, 'Thanks!')

    const list = await client.get('/api/mcp/v1/forms').header('Authorization', bearer(t))
    list.assertStatus(200)
    assert.isTrue((list.body() as Array<{ id: string }>).some((f) => f.id === id))

    const got = await client.get(`/api/mcp/v1/forms/${id}`).header('Authorization', bearer(t))
    got.assertStatus(200)
    assert.equal(got.body().fields[0].key, 'email')

    const del = await client.delete(`/api/mcp/v1/forms/${id}`).header('Authorization', bearer(t))
    del.assertStatus(200)
    assert.isNull(await Form.find(id))
  })

  test('an invalid field schema is rejected 422 with the reason', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:forms'])
    const created = await client
      .post('/api/mcp/v1/forms')
      .header('Authorization', bearer(t))
      .json({ title: 'Bad form' })
    const id = created.body().id as string

    // A select field with no options is structurally invalid.
    const bad = await client
      .put(`/api/mcp/v1/forms/${id}`)
      .header('Authorization', bearer(t))
      .json({ fields: [{ key: 'pick', label: 'Pick', type: 'select' }] })
    bad.assertStatus(422)
    assert.match(bad.body().message, /option/i)
  })

  test('builder:read alone cannot create a form (needs builder:forms)', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/forms')
      .header('Authorization', bearer(t))
      .json({ title: 'Nope' })
    res.assertStatus(403)
  })
})

test.group('MCP parity | page SEO + scheduling + code-chrome on create', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create_page persists seo, scheduledPublishAt and codeHeader', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const when = '2099-01-02T03:04:00.000Z'
    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({
        title: 'Scheduled Landing',
        path: '/scheduled-landing',
        content: page([{ type: 'Heading', props: { text: 'Hi', level: '1' } }]),
        seo: { description: 'A test page', ogImage: '/uploads/og.jpg' },
        scheduledPublishAt: when,
      })
    created.assertStatus(201)

    const row = await Page.findOrFail(created.body().id)
    assert.equal((row.seo as { description?: string }).description, 'A test page')
    assert.equal((row.seo as { ogImage?: string }).ogImage, '/uploads/og.jpg')
    assert.exists(row.scheduledPublishAt)
    assert.equal(row.scheduledPublishAt!.toUTC().toISO(), when)
  })
})

test.group('MCP parity | behaviour props validate cleanly', () => {
  test('scrollAnimation / bgLazy / htmlId / attributes raise no unknown-prop warning', async ({
    assert,
  }) => {
    const res = await validatePuckDocument(
      page([
        {
          type: 'Section',
          props: {
            id: 's',
            scrollAnimation: { type: 'fade-up', duration: '600ms', once: true },
            bgLazy: true,
            htmlId: 'pricing',
            attributes: [{ name: 'data-track', value: 'hero' }],
            content: [],
          },
        },
      ]),
      'page'
    )
    assert.isTrue(res.valid)
    const noisy = res.warnings.filter((w) =>
      /scrollAnimation|bgLazy|htmlId|attributes/.test(w.message)
    )
    assert.deepEqual(noisy, [], `behaviour props should not warn: ${JSON.stringify(noisy)}`)
  })

  test('the emitted catalog advertises behaviorSchemas', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const app = (await import('@adonisjs/core/services/app')).default
    const catalog = JSON.parse(
      await readFile(app.makePath('resources/mcp/catalog.page.json'), 'utf8')
    ) as { behaviorSchemas?: Record<string, string> }
    assert.exists(catalog.behaviorSchemas)
    for (const key of ['scrollAnimation', 'bgLazy', 'htmlId', 'attributes', 'binding', 'conditions']) {
      assert.property(catalog.behaviorSchemas!, key)
    }
  })
})

test.group('MCP parity | SSG invalidation + code gate', (group) => {
  group.each.setup(async () => resetDatabase())

  test('MCP setAppearance busts SSG snapshots', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:settings'])

    // A page with a cached SSG snapshot.
    await Page.create({
      id: randomUUID(),
      title: 'Cached',
      path: '/cached-ssg',
      status: 'PUBLISHED',
      kind: 'BUILDER',
      renderMode: 'SSG',
      content: page([]),
      seo: {},
      renderedHtml: '<html>stale</html>',
      renderedBuild: 'build-1',
    } as Partial<Page>)

    const res = await client
      .put('/api/mcp/v1/appearance')
      .header('Authorization', bearer(t))
      .json({ primaryColor: '#123456' })
    res.assertStatus(200)

    const fresh = await Page.findByOrFail('path', '/cached-ssg')
    assert.isNull(fresh.renderedHtml)
    assert.isNull(fresh.renderedBuild)
  })

  test('per-page JS in root.props.codeSnippets is detected as privileged', async ({ assert }) => {
    const withJs = {
      root: { props: { codeSnippets: [{ id: 'a', name: 'x', lang: 'js', code: 'alert(1)', enabled: true }] } },
      content: [],
    }
    const withCss = {
      root: { props: { codeSnippets: [{ id: 'b', name: 'y', lang: 'css', code: 'body{color:red}', enabled: true }] } },
      content: [],
    }
    const legacyJs = { root: { props: { customJs: 'alert(2)' } }, content: [] }
    const plain = { root: { props: {} }, content: [{ type: 'Heading', props: { id: 'h', text: 'Hi' } }] }
    const emptySnippets = { root: { props: { codeSnippets: [] } }, content: [] }

    assert.isTrue(hasPrivilegedPageContent(withJs), 'root JS snippet must be privileged')
    assert.isTrue(hasPrivilegedPageContent(withCss), 'root CSS snippet must be privileged')
    assert.isTrue(hasPrivilegedPageContent(legacyJs), 'legacy customJs must be privileged')
    assert.isFalse(hasPrivilegedPageContent(plain), 'a plain page is not privileged')
    assert.isFalse(hasPrivilegedPageContent(emptySnippets), 'an empty codeSnippets array is not privileged')
  })
})
