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

  test('export runs as a background job and yields a downloadable archive', async ({
    client,
    assert,
  }) => {
    // 202 + jobId. In tests the queue is disabled, so the job runs inline and is
    // already terminal by the time the request returns.
    const start = await client
      .post('/api/admin/data-transfer/export')
      .loginAs(await admin())
      .json({ only: ['settings'] })
    start.assertStatus(202)
    const jobId = start.body().jobId as string
    assert.exists(jobId)

    const status = await client.get(`/api/admin/data-transfer/jobs/${jobId}`).loginAs(await admin())
    status.assertStatus(200)
    assert.equal(status.body().job.state, 'succeeded')
    assert.isTrue(status.body().job.downloadReady)

    const dl = await client
      .get(`/api/admin/data-transfer/exports/${jobId}/download`)
      .loginAs(await admin())
    dl.assertStatus(200)
  })

  test('import runs as a background job and restores the archive', async ({ client, assert }) => {
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
    res.assertStatus(202)
    const jobId = res.body().jobId as string
    assert.exists(jobId)

    // Inline (queue disabled) → already restored + terminal.
    assert.lengthOf(await Redirect.query().where('from_path', 'old'), 1)
    const status = await client.get(`/api/admin/data-transfer/jobs/${jobId}`).loginAs(await admin())
    assert.equal(status.body().job.state, 'succeeded')
    assert.isTrue(
      (status.body().job.result.sections as Array<{ name: string }>).some(
        (s) => s.name === 'redirects'
      )
    )
  })

  test('dry-run import previews without writing (synchronous)', async ({ client, assert }) => {
    await new RedirectsService().create({ fromPath: '/keep', toPath: '/there' })
    const archive = await new SiteExportService().export({ only: ['redirects'] })
    const tmp = join(tmpdir(), `dt-api-dry-${Date.now()}.driftless`)
    await writeFile(tmp, archive)

    const res = await client
      .post('/api/admin/data-transfer/import')
      .loginAs(await admin())
      .file('archive', tmp)
      .field('dryRun', 'true')
    res.assertStatus(200)
    assert.isTrue(res.body().dryRun)
    assert.exists(res.body().result)
  })
})
