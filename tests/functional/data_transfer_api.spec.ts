import { test } from '@japa/runner'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Redirect from '#models/redirect'
import RedirectsService from '#services/redirects_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'

/**
 * The admin HTTP surface: auth gating, the section manifest, and a full
 * export → upload → import round-trip through the endpoints (the engine itself
 * is covered by data_transfer.spec.ts).
 */
test.group('Data transfer | admin API', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

  test('manifest requires authentication', async ({ client }) => {
    const res = await client.get('/api/admin/data-transfer/manifest')
    res.assertStatus(401)
  })

  test('manifest lists core sections', async ({ client, assert }) => {
    const res = await client.get('/api/admin/data-transfer/manifest').loginAs(await admin())
    res.assertStatus(200)
    const names = (res.body().sections as Array<{ name: string }>).map((s) => s.name)
    assert.include(names, 'pages')
    assert.include(names, 'settings')
  })

  test('export streams a .driftless attachment', async ({ client }) => {
    const res = await client
      .post('/api/admin/data-transfer/export')
      .loginAs(await admin())
      .json({ only: ['settings'] })
    res.assertStatus(200)
    res.assertHeader('content-type', 'application/octet-stream')
  })

  test('import restores an uploaded archive', async ({ client, assert }) => {
    await new RedirectsService().create({ fromPath: '/old', toPath: '/new' })
    const archive = await new SiteExportService().export({ only: ['redirects'] })
    const tmp = join(tmpdir(), `dt-api-${Date.now()}.driftless`)
    await writeFile(tmp, archive)

    await Redirect.query().delete()

    const res = await client
      .post('/api/admin/data-transfer/import')
      .loginAs(await admin())
      .file('archive', tmp)
      .field('mode', 'preserve')
      .field('conflict', 'overwrite')
    res.assertStatus(200)
    assert.isTrue(
      (res.body().sections as Array<{ name: string }>).some((s) => s.name === 'redirects')
    )
    assert.lengthOf(await Redirect.query().where('from_path', 'old'), 1)
  })
})
