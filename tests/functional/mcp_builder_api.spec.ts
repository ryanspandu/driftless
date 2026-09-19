import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Module from '#models/module'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import ModulesService from '#services/modules_service'
import TemplateKitsService from '#services/template_kits_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

/** Toggle the MCP module; `setEnabled` writes the row AND busts the cache the
 *  `moduleEnabled` middleware reads, so the change takes effect immediately. */
async function setMcpEnabled(enabled: boolean) {
  await new ModulesService().setEnabled('mcp', enabled)
}
const enableMcp = () => setMcpEnabled(true)

/** Mint a personal access token for the admin with the given abilities. */
async function token(abilities: string[]): Promise<string> {
  const user = await admin()
  const t = await User.accessTokens.create(user, abilities, { name: 'test' })
  return t.value!.release()
}

const bearer = (t: string) => `Bearer ${t}`

/** ecommerce is autoEnable:false — turn it on + bust the cache `isEnabled` reads. */
async function enableEcommerce() {
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  new ModulesService().bustCache()
}

const validPage = {
  root: { props: {} },
  content: [{ type: 'Heading', props: { text: 'Hello', level: '1' } }],
}

test.group('MCP builder-API | auth + module gating', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the catalog needs a valid access token', async ({ client }) => {
    await enableMcp()
    const anon = await client.get('/api/mcp/v1/catalog')
    anon.assertStatus(401)
  })

  test('a disabled module hides the builder-API', async ({ client }) => {
    await setMcpEnabled(false)
    const t = await token(['builder:read'])
    const res = await client.get('/api/mcp/v1/catalog').header('Authorization', bearer(t))
    // moduleEnabled short-circuits before the controller runs.
    res.assertStatus(404)
  })

  test('a read token can fetch the block catalog', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client.get('/api/mcp/v1/catalog?type=page').header('Authorization', bearer(t))
    res.assertStatus(200)
    const body = res.body()
    assert.isArray(body.blocks)
    assert.isAbove(body.blocks.length, 0)

    // Core blocks are tagged module: null; module-contributed blocks name their
    // module (provenance). Every block carries the `module` field.
    const heading = body.blocks.find((b: { type: string }) => b.type === 'Heading')
    assert.exists(heading)
    assert.property(heading, 'module')
    assert.isNull(heading.module)

    const product = body.blocks.find((b: { type: string }) => b.type === 'ProductList')
    if (product) assert.equal(product.module, 'ecommerce')
  })
})

test.group('MCP builder-API | ability gating', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a read-only token cannot create a page (needs builder:pages)', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'X', path: '/nope', content: validPage })
    res.assertStatus(403)
  })

  test('a read-only token cannot create a collection (needs builder:collections)', async ({
    client,
  }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/collections')
      .header('Authorization', bearer(t))
      .json({ key: 'nope', label: 'Nope' })
    res.assertStatus(403)
  })
})

test.group('MCP builder-API | collection types', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create_collection makes a CONTENT (metadata-only) collection', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const t = await token(['builder:collections'])
    const res = await client
      .post('/api/mcp/v1/collections')
      .header('Authorization', bearer(t))
      .json({
        key: 'article_meta',
        label: 'Article meta',
        type: 'CONTENT',
        fields: [{ key: 'reading_time', label: 'Reading time', type: 'INTEGER' }],
      })
    // The whole bug in one assertion: the MCP endpoint now honours `type` — a
    // metadata-only collection is created rather than a plain COLLECTION.
    assert.equal(res.status(), 201, `body: ${JSON.stringify(res.body())}`)
    assert.equal(res.body().type, 'CONTENT')
    assert.isNull(res.body().tableName ?? null)
  })

  test('create_collection makes a PRODUCT collection when ecommerce is on', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    await enableEcommerce()
    const t = await token(['builder:collections'])
    const res = await client
      .post('/api/mcp/v1/collections')
      .header('Authorization', bearer(t))
      .json({
        key: 'product_meta',
        label: 'Product meta',
        type: 'PRODUCT',
        fields: [{ key: 'warranty_months', label: 'Warranty', type: 'INTEGER' }],
      })
    assert.equal(res.status(), 201, `body: ${JSON.stringify(res.body())}`)
    assert.equal(res.body().type, 'PRODUCT')
    assert.isNull(res.body().tableName ?? null)
  })

  test('a PRODUCT collection is refused (422) while ecommerce is off', async ({ client }) => {
    await enableMcp()
    // Deliberately not enabling ecommerce.
    const t = await token(['builder:collections'])
    const res = await client
      .post('/api/mcp/v1/collections')
      .header('Authorization', bearer(t))
      .json({ key: 'product_meta', label: 'Product meta', type: 'PRODUCT' })
    res.assertStatus(422)
  })
})

test.group('MCP builder-API | pages + validator', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create → publish makes a live page', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])

    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'MCP Landing', path: '/mcp-landing', content: validPage })
    created.assertStatus(201)
    const id = created.body().id
    assert.exists(id)

    const published = await client
      .post(`/api/mcp/v1/pages/${id}/publish`)
      .header('Authorization', bearer(t))
      .json({})
    published.assertStatus(200)
    published.assertBodyContains({ status: 'PUBLISHED' })

    // The public route now resolves it instead of 404ing.
    const live = await client.get('/mcp-landing')
    live.assertStatus(200)
  })

  test('the validator rejects an unknown block type (422)', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({
        title: 'Bad',
        path: '/bad',
        content: { root: { props: {} }, content: [{ type: 'NotARealBlock', props: {} }] },
      })
    res.assertStatus(422)
    res.assertBodyContains({ message: 'Invalid page content' })
  })

  test('validate endpoint reports issues without writing', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/pages/validate')
      .header('Authorization', bearer(t))
      .json({ content: { root: { props: {} }, content: [{ type: 'Ghost', props: {} }] } })
    res.assertStatus(200)
    const body = res.body()
    assert.isFalse(body.valid)
    assert.isAbove(body.issues.length, 0)
  })

  test('patch_page_content edits one block of the draft by its id', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({
        title: 'Patch',
        path: '/patch-test',
        content: {
          root: { props: {} },
          content: [{ type: 'Heading', props: { id: 'h1', text: 'Old', level: '1' } }],
        },
      })
    created.assertStatus(201)
    const id = created.body().id

    const patched = await client
      .put(`/api/mcp/v1/pages/${id}/content/patch`)
      .header('Authorization', bearer(t))
      .json({ ops: [{ op: 'update_props', id: 'h1', props: { text: 'New' } }] })
    patched.assertStatus(200)
    assert.isArray(patched.body().applied)
    assert.lengthOf(patched.body().applied, 1)

    const page = await client.get(`/api/mcp/v1/pages/${id}`).header('Authorization', bearer(t))
    const draft = page.body().draftContent
    assert.equal(draft.content[0].props.text, 'New')
  })

  test('a write response carries validator warnings/changes', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    // No id on the block → the validator fills one and records a change; an
    // unknown prop → a warning. Both must ride on the create response.
    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({
        title: 'Advisories',
        path: '/advisories-test',
        content: {
          root: { props: {} },
          content: [{ type: 'Heading', props: { text: 'Hi', bogusProp: 1 } }],
        },
      })
    created.assertStatus(201)
    assert.isArray(created.body().changes)
    assert.isTrue(
      created.body().warnings.some((w: { message: string }) => /bogusProp/.test(w.message))
    )
  })
})

test.group('MCP builder-API | custom templates (kits)', (group) => {
  group.each.setup(async () => resetDatabase())
  // The committed `example` reference kit ships fail-closed (inactive by default),
  // so activate it explicitly here — these tests build on it, and a self-contained
  // setup must not depend on ambient dev-DB state (tests run on a fresh seed).
  group.each.setup(() => new TemplateKitsService().setActive('example', true))

  test('list_custom_templates returns the committed example kit', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const res = await client.get('/api/mcp/v1/custom-templates').header('Authorization', bearer(t))
    res.assertStatus(200)
    const kits: Array<{ id: string }> = res.body()
    assert.isArray(kits)
    assert.isTrue(kits.some((k) => k.id === 'example'))
  })

  test('create → publish → render a kit page end to end', async ({ client, assert }) => {
    await enableMcp()
    // The seeded admin holds settings:manage, so the executable-content gate lets
    // this through; a user without it is refused (mirrors the admin controller).
    const t = await token(['builder:read', 'builder:pages'])
    const created = await client.post('/api/mcp/v1/pages').header('Authorization', bearer(t)).json({
      title: 'Kit Page',
      path: '/kit-page',
      status: 'PUBLISHED',
      kind: 'CODE',
      component: 'kit:example',
    })
    created.assertStatus(201)
    assert.equal(created.body().kind, 'CODE')
    assert.equal(created.body().component, 'kit:example')

    // The public route resolves the kit and renders its folder's index.tsx.
    const live = await client.get('/kit-page')
    live.assertStatus(200)
    // The kit's own markup (from inertia/custom/kits/example/) is in the HTML.
    assert.include(live.text(), 'custom template kit')
    assert.include(live.text(), 'Kit Page')
  })

  test('a page pointing at an unknown kit is rejected (422)', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const res = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({ title: 'Ghost', path: '/ghost-kit', kind: 'CODE', component: 'kit:does-not-exist' })
    res.assertStatus(422)
  })

  test('contentFields flow through create, set_page_content (draft) and publish', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])

    // create_page: set at creation.
    const created = await client
      .post('/api/mcp/v1/pages')
      .header('Authorization', bearer(t))
      .json({
        title: 'Kit Fields Page',
        path: '/kit-fields-page',
        kind: 'CODE',
        component: 'kit:example',
        contentFields: { headline: 'Created headline' },
      })
    created.assertStatus(201)
    assert.deepEqual(created.body().contentFields, { headline: 'Created headline' })
    const id = created.body().id

    // set_page_content: stage a draft with ONLY contentFields, no Puck content.
    const staged = await client
      .put(`/api/mcp/v1/pages/${id}/content`)
      .header('Authorization', bearer(t))
      .json({ contentFields: { headline: 'Drafted headline' } })
    staged.assertStatus(200)
    assert.deepEqual(staged.body().draftContentFields, { headline: 'Drafted headline' })
    assert.deepEqual(staged.body().contentFields, { headline: 'Created headline' })

    // publish_page: explicit contentFields wins over the staged draft.
    const published = await client
      .post(`/api/mcp/v1/pages/${id}/publish`)
      .header('Authorization', bearer(t))
      .json({ contentFields: { headline: 'Published headline' } })
    published.assertStatus(200)
    assert.deepEqual(published.body().contentFields, { headline: 'Published headline' })
    assert.isNull(published.body().draftContentFields)
  })
})

test.group('MCP builder-API | collection public detail pages', (group) => {
  // The truncate cleanup empties the metadata rows, but dynamic tables are not part
  // of the migrations: drop the one these tests create so a later run never
  // inherits a stale schema.
  const dropTables = () => db.connection().schema.dropTableIfExists('cms_portfolio')
  group.each.setup(async () => {
    const truncate = await resetDatabase()
    await dropTables()
    return async () => {
      await truncate()
      await dropTables()
    }
  })

  const template = (kind: 'CODE' | 'BUILDER' = 'CODE') =>
    Page.create({
      id: newUlid(),
      title: 'Portfolio case template',
      path: `portfolio-case-${newUlid().slice(-6)}`,
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind,
      component: kind === 'CODE' ? 'x' : null,
      content: { root: {}, content: [] },
      seo: {},
    } as never)

  const fields = (unique: boolean) => [
    { key: 'title', label: 'Title', type: 'TEXT', required: true },
    { key: 'slug', label: 'Slug', type: 'SLUG', unique },
  ]

  async function createPortfolio(client: ApiClient, t: string, body: Record<string, unknown>) {
    return client
      .post('/api/mcp/v1/collections')
      .header('Authorization', bearer(t))
      .json({ key: 'portfolio', label: 'Portfolio', ...body })
  }

  test('create_collection with detail pages on echoes the settings (201)', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const page = await template()
    const t = await token(['builder:collections'])
    const res = await createPortfolio(client, t, {
      fields: fields(true),
      detailPagesOn: true,
      detailPathPrefix: 'portfolio',
      detailPageId: page.id,
    })
    res.assertStatus(201)
    assert.isTrue(res.body().detailPagesOn)
    assert.equal(res.body().detailPathPrefix, 'portfolio')
    assert.equal(res.body().detailPageId, page.id)
  })

  test('a non-unique slug field is rejected (422 "must be unique")', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:collections'])
    const res = await createPortfolio(client, t, {
      fields: fields(false),
      detailPagesOn: true,
      detailPathPrefix: 'portfolio',
    })
    res.assertStatus(422)
    assert.include(res.body().message, 'must be unique')
  })

  test('a builder page as the template is rejected (422)', async ({ client, assert }) => {
    await enableMcp()
    const builder = await template('BUILDER')
    const t = await token(['builder:collections'])
    const res = await createPortfolio(client, t, {
      fields: fields(true),
      detailPagesOn: true,
      detailPathPrefix: 'portfolio',
      detailPageId: builder.id,
    })
    res.assertStatus(422)
    assert.include(res.body().message, 'CODE')
  })

  test('a reserved prefix is rejected (422)', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:collections'])
    const reserved = await createPortfolio(client, t, {
      fields: fields(true),
      detailPagesOn: true,
      detailPathPrefix: 'admin',
    })
    reserved.assertStatus(422)
    assert.match(reserved.body().message, /reserved/)
  })

  test('update_collection: null clears the template, off keeps prefix + template', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const page = await template()
    const t = await token(['builder:collections'])
    const created = await createPortfolio(client, t, {
      fields: fields(true),
      detailPagesOn: true,
      detailPathPrefix: 'portfolio',
      detailPageId: page.id,
    })
    created.assertStatus(201)

    // Turning it off never touches the stored prefix / template.
    const off = await client
      .put('/api/mcp/v1/collections/portfolio')
      .header('Authorization', bearer(t))
      .json({ detailPagesOn: false })
    off.assertStatus(200)
    assert.isFalse(off.body().detailPagesOn)
    assert.equal(off.body().detailPathPrefix, 'portfolio')
    assert.equal(off.body().detailPageId, page.id)

    // ...so it can be switched back on without re-sending them.
    const on = await client
      .put('/api/mcp/v1/collections/portfolio')
      .header('Authorization', bearer(t))
      .json({ detailPagesOn: true })
    on.assertStatus(200)
    assert.isTrue(on.body().detailPagesOn)
    assert.equal(on.body().detailPathPrefix, 'portfolio')
    assert.equal(on.body().detailPageId, page.id)

    // null clears the template only.
    const cleared = await client
      .put('/api/mcp/v1/collections/portfolio')
      .header('Authorization', bearer(t))
      .json({ detailPageId: null })
    cleared.assertStatus(200)
    assert.isNull(cleared.body().detailPageId)
    assert.equal(cleared.body().detailPathPrefix, 'portfolio')
    assert.isTrue(cleared.body().detailPagesOn)

    // The change is what a fresh read sees.
    const read = await client
      .get('/api/mcp/v1/collections/portfolio')
      .header('Authorization', bearer(await token(['builder:read'])))
    read.assertStatus(200)
    assert.isNull(read.body().detailPageId)
    assert.equal(read.body().detailPathPrefix, 'portfolio')
  })
})
