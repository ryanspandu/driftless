import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { checkDesignCoverage } from '#modules/mcp/services/design_coverage'

/**
 * MCP design brief + coverage: the brief is stored on the page and surfaced by
 * get_page, and check_design_coverage reports the drifts that made past builds
 * look off-brand (missing section, theme-coloured CTA, placeholder image,
 * emoji icon) — the primary fidelity gate now that screenshots are skipped.
 */
async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

async function enableMcp() {
  await new ModulesService().setEnabled('mcp', true)
  await Module.updateOrCreate({ name: 'mcp' }, { name: 'mcp', enabled: true, version: '1.0.0' })
  new ModulesService().bustCache()
}

async function token(abilities: string[]): Promise<string> {
  const t = await User.accessTokens.create(await admin(), abilities, { name: 'test' })
  return t.value!.release()
}
const bearer = (t: string) => `Bearer ${t}`

async function createPage(client: any, t: string, content: unknown): Promise<string> {
  const res = await client
    .post('/api/mcp/v1/pages')
    .header('Authorization', bearer(t))
    .json({ title: 'Brief Test', path: `/brief-${Date.now()}-${Math.random().toString(36).slice(2)}`, content })
  res.assertStatus(201)
  return res.body().id
}

const section = (children: unknown[] = []) => ({
  type: 'Section',
  props: { content: [{ type: 'Container', props: { content: children } }] },
})

test.group('MCP brief + coverage', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a brief is stored and returned by get_page', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const id = await createPage(client, t, { root: { props: {} }, content: [section()] })

    const brief = {
      palette: { primary: '#3a4a3e' },
      iconStyle: 'line',
      sections: [{ key: 'hero', headline: 'Modular storage' }],
    }
    const put = await client
      .put(`/api/mcp/v1/pages/${id}/brief`)
      .header('Authorization', bearer(t))
      .json({ brief })
    put.assertStatus(200)

    const show = await client.get(`/api/mcp/v1/pages/${id}`).header('Authorization', bearer(t))
    assert.equal((show.body().designBrief as any).palette.primary, '#3a4a3e')
  })

  test('coverage reports a missing section and a theme-coloured CTA', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    // One section built, but the brief lists two; the CTA is a theme-primary Button.
    const content = {
      root: { props: {} },
      content: [
        section([
          { type: 'Heading', props: { text: 'Modular storage' } },
          { type: 'Button', props: { label: 'Shop', href: '#', variant: 'primary' } },
        ]),
      ],
    }
    const id = await createPage(client, t, content)
    await client
      .put(`/api/mcp/v1/pages/${id}/brief`)
      .header('Authorization', bearer(t))
      .json({
        brief: {
          palette: { primary: '#3a4a3e' },
          sections: [
            { key: 'hero', headline: 'Modular storage' },
            { key: 'productGrid', headline: 'Shop the system' },
          ],
        },
      })

    const res = await client.get(`/api/mcp/v1/pages/${id}/coverage`).header('Authorization', bearer(t))
    res.assertStatus(200)
    const body = res.body()
    assert.isTrue(body.coverage < 1)
    assert.isAbove(body.missing.length, 0)
    // The site theme default (#5225e6) != brief primary (#3a4a3e) → off-brand CTA.
    assert.isTrue(body.offBrand.some((m: string) => /theme colour|primary/i.test(m)))
  })

  // A placeholder Image can no longer be WRITTEN (the validator blocks it at
  // create), so exercise the coverage detector directly on such content —
  // covering the case where a page acquired a bad image some other way.
  test('coverage flags a placeholder image and an emoji icon', ({ assert }) => {
    const report = checkDesignCoverage({
      content: [
        section([
          { type: 'Image', props: { src: 'https://picsum.photos/1200/800' } },
          { type: 'Icon', props: { name: '📦' } },
        ]),
      ],
      brief: { iconStyle: 'line', sections: [{ key: 'hero' }] },
      themeEffective: { primary: '#5225e6', secondary: '#eeeeee' },
    })
    assert.isTrue(report.substitutions.some((m) => /placeholder|picsum/i.test(m)))
    assert.isTrue(report.offBrand.some((m) => /emoji/i.test(m)))
  })

  test('no brief yields a hasBrief:false report', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const id = await createPage(client, t, { root: { props: {} }, content: [section()] })
    const res = await client.get(`/api/mcp/v1/pages/${id}/coverage`).header('Authorization', bearer(t))
    assert.isFalse(res.body().hasBrief)
  })
})

test.group('MCP preview token', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a builder:pages token mints a preview URL that renders the draft', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const t = await token(['builder:read', 'builder:pages'])
    const id = await createPage(client, t, { root: { props: {} }, content: [section()] })

    const res = await client
      .post(`/api/mcp/v1/pages/${id}/preview-token`)
      .header('Authorization', bearer(t))
    res.assertStatus(200)
    const body = res.body()
    assert.isString(body.token)
    assert.match(body.url, /\/preview\//)

    const view = await client.get(`/preview/${body.token}`)
    view.assertStatus(200)
  })

  test('preview-token needs builder:pages', async ({ client }) => {
    await enableMcp()
    const writer = await token(['builder:read', 'builder:pages'])
    const id = await createPage(client, writer, { root: { props: {} }, content: [section()] })
    const readOnly = await token(['builder:read'])
    const res = await client
      .post(`/api/mcp/v1/pages/${id}/preview-token`)
      .header('Authorization', bearer(readOnly))
    res.assertStatus(403)
  })
})
