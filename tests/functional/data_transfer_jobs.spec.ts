import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import { newUlid } from '#services/ulid_service'
import RedirectsService from '#services/redirects_service'
import DataTransferJob from '#models/data_transfer_job'
import SiteExportService from '#services/data_transfer/site_export_service'
import TransferJobService from '#services/data_transfer/transfer_job_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'

/**
 * Background export/import jobs. In tests QUEUE_ENABLED=false, so `enqueue`
 * returns false and `TransferJobService` runs the job INLINE — which is exactly
 * the fallback path, and lets us assert the whole flow without a live worker.
 */
test.group('Data transfer | background jobs', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  test('export job builds an archive and marks succeeded', async ({ assert }) => {
    await new RedirectsService().create({ fromPath: '/a', toPath: '/b' })

    const job = await new TransferJobService().startExport({ only: ['redirects'] })

    assert.equal(job.state, 'succeeded')
    assert.isNull(job.activeLock)
    assert.equal(job.completed, job.total)
    assert.isNotNull(job.downloadPath)
    assert.isTrue(existsSync(job.downloadPath!))
    assert.equal((job.result as { filename?: string })?.filename?.endsWith('.driftless'), true)
  })

  test('import job restores an archive, records the result, and cleans up', async ({ assert }) => {
    await new RedirectsService().create({ fromPath: '/x', toPath: '/y' })
    const archive = await new SiteExportService().export({ only: ['redirects'] })

    const dir = app.makePath('storage/imports')
    await mkdir(dir, { recursive: true })
    const archivePath = join(dir, `${newUlid()}.driftless`)
    await writeFile(archivePath, archive)

    const job = await new TransferJobService().startImport({ archivePath, only: ['redirects'] })

    assert.equal(job.state, 'succeeded')
    assert.equal(job.completed, job.total)
    assert.isAbove(job.total, 0)
    const result = job.result as { sections?: unknown[]; log?: string[] }
    assert.isArray(result.sections)
    assert.isTrue((result.log ?? []).length > 0)
    // The staged upload is consumed on completion.
    assert.isFalse(existsSync(archivePath))
  })

  test('a stuck queued job with no worker is reclaimed, not a permanent block', async ({
    assert,
  }) => {
    // A job left `queued` with the lock held but no worker to run it (Redis up,
    // `npm run worker` never started) must not block the operator forever.
    await DataTransferJob.create({
      id: newUlid(),
      kind: 'export',
      state: 'queued',
      activeLock: 'export',
      total: 0,
      completed: 0,
      logTail: [],
      only: [],
      dryRun: false,
    })

    // No worker in tests → the stuck job is reclaimed and a fresh export runs inline.
    const job = await new TransferJobService().startExport({ only: ['redirects'] })
    assert.equal(job.state, 'succeeded')
    const exportJobs = await DataTransferJob.query().where('kind', 'export')
    assert.isTrue(exportJobs.some((j) => j.state === 'failed'))
  })

  test('a second import while one is active is refused (single-flight)', async ({ assert }) => {
    // Simulate an in-flight import holding the lock.
    await DataTransferJob.create({
      id: newUlid(),
      kind: 'import',
      state: 'running',
      activeLock: 'import',
      total: 0,
      completed: 0,
      logTail: [],
      only: [],
      dryRun: false,
      startedAt: DateTime.now(),
    })

    await assert.rejects(
      () => new TransferJobService().startImport({ archivePath: '/tmp/none.driftless' }),
      /already running/i
    )
  })
})
