import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'
import ModuleInstallJob, { ACTIVE_LOCK } from '#models/module_install_job'
import Module from '#models/module'
import ModuleInstallJobService from '#services/module_install_job_service'
import { newUlid } from '#services/ulid_service'

/**
 * The bookkeeping that has to survive the process dying.
 *
 * An install ends by restarting the web server, so none of this can be held in
 * memory — the row *is* the state, and every property below is one an operator
 * would only discover was broken by losing an install to it.
 */

function job(over: Partial<ModuleInstallJob> = {}) {
  return ModuleInstallJob.create({
    id: newUlid(),
    moduleName: 'announcements',
    state: 'running',
    activeLock: ACTIVE_LOCK,
    requiresBuild: false,
    requiresRestart: true,
    heartbeatAt: DateTime.now(),
    startedAt: DateTime.now(),
    ...over,
  } as Partial<ModuleInstallJob>)
}

test.group('Module install jobs | single flight', (group) => {
  group.each.setup(async () => {
    await testUtils.db().seed()

    /**
     * Cleared explicitly. `testUtils.db().truncate()` **returns** a teardown
     * function rather than truncating — awaiting it only runs migrations, and
     * the returned function has to be returned from the hook to have any
     * effect. The rest of this suite awaits it and discards the result, which
     * works there only because those tests use `updateOrCreate`. A unique
     * index does not forgive that.
     */
    await ModuleInstallJob.query().delete()
  })

  test('a second active job is refused by the database', async ({ assert }) => {
    await job()

    /**
     * The guard is a unique index on a nullable column rather than a partial
     * index, specifically so it exists on SQLite too and can be proven here
     * rather than only in `tests/pg`. Two installs at once would race over
     * `build/`, `releases/` and the migrator.
     */
    await assert.rejects(() => job({ moduleName: 'other' }))
  })

  test('a terminal job releases the slot', async ({ assert }) => {
    const first = await job()

    await new ModuleInstallJobService().markSucceeded(first.id, [])

    const second = await job({ moduleName: 'other' })
    assert.equal(second.activeLock, ACTIVE_LOCK)

    // And unlimited finished rows may coexist, because NULLs are distinct.
    await new ModuleInstallJobService().markSucceeded(second.id, [])
    await job({ moduleName: 'third' })
  })

  test('markFailed also releases the slot', async ({ assert }) => {
    const first = await job()

    await new ModuleInstallJobService().markFailed(first.id, {
      step: 'build',
      reason: 'build_failed',
      message: 'nope',
    })

    const reloaded = await ModuleInstallJob.findOrFail(first.id)
    assert.isNull(reloaded.activeLock)
    assert.equal(reloaded.state, 'failed')
    assert.isNotNull(reloaded.finishedAt)
  })
})

test.group('Module install jobs | resume on boot', (group) => {
  group.each.setup(async () => {
    await testUtils.db().seed()

    /**
     * Cleared explicitly. `testUtils.db().truncate()` **returns** a teardown
     * function rather than truncating — awaiting it only runs migrations, and
     * the returned function has to be returned from the hook to have any
     * effect. The rest of this suite awaits it and discards the result, which
     * works there only because those tests use `updateOrCreate`. A unique
     * index does not forgive that.
     */
    await ModuleInstallJob.query().delete()
  })

  test('a job whose installer stopped reporting is abandoned', async ({ assert }) => {
    const stale = await job({
      state: 'running',
      heartbeatAt: DateTime.now().minus({ minutes: 5 }),
    })

    await new ModuleInstallJobService().resumeOnBoot()

    const reloaded = await ModuleInstallJob.findOrFail(stale.id)

    assert.equal(reloaded.state, 'abandoned')
    /** The slot must come back, or no further install is ever possible. */
    assert.isNull(reloaded.activeLock)
    assert.equal(reloaded.errorReason, 'installer_vanished')
  })

  test('a job still beating is left alone', async ({ assert }) => {
    const live = await job({ state: 'running', heartbeatAt: DateTime.now() })

    await new ModuleInstallJobService().resumeOnBoot()

    assert.equal((await ModuleInstallJob.findOrFail(live.id)).state, 'running')
  })

  test('awaiting_restart succeeds only when the module actually loads', async ({ assert }) => {
    /**
     * `announcements` is a real module this process imported, and reconcile has
     * written its row. That is the whole bar: the module resolves *and* is
     * enabled. Anything less is not a successful install.
     */
    await Module.updateOrCreate(
      { name: 'announcements' },
      {
        id: newUlid(),
        name: 'announcements',
        enabled: true,
        version: '1.0.0',
        kind: 'plugin',
        source: 'bundled',
      }
    )

    const waiting = await job({ state: 'awaiting_restart', requiresBuild: false })

    await new ModuleInstallJobService().resumeOnBoot()

    const reloaded = await ModuleInstallJob.findOrFail(waiting.id)
    assert.equal(reloaded.state, 'succeeded')
    assert.isNull(reloaded.activeLock)
  })

  test('awaiting_restart fails when the module still does not load', async ({ assert }) => {
    const waiting = await job({
      moduleName: 'never-existed',
      state: 'awaiting_restart',
      requiresBuild: false,
    })

    await new ModuleInstallJobService().resumeOnBoot()

    const reloaded = await ModuleInstallJob.findOrFail(waiting.id)

    /**
     * Honest beats optimistic. Reporting success here would tell the operator
     * the install worked while the module is not there — and they would only
     * find out when they went looking for it.
     */
    assert.equal(reloaded.state, 'failed')
    assert.equal(reloaded.errorReason, 'module_not_loadable_after_restart')
    assert.isNull(reloaded.activeLock)
  })

  test('a build job whose release is not live yet is left alone', async ({ assert }) => {
    /**
     * We are an older worker that has not cycled into the new release. Settling
     * the job here would decide the outcome from a process that cannot see the
     * result.
     */
    const waiting = await job({
      state: 'awaiting_restart',
      requiresBuild: true,
      releaseStamp: 'a-release-that-is-not-current',
    })

    await new ModuleInstallJobService().resumeOnBoot()

    assert.equal((await ModuleInstallJob.findOrFail(waiting.id)).state, 'awaiting_restart')
  })
})

test.group('Module install jobs | name resolution', () => {
  test('a name not on disk is refused', async ({ assert }) => {
    const service = new ModuleInstallJobService()

    await assert.rejects(async () => service.resolveName('../../etc'))
    await assert.rejects(async () => service.resolveName('does-not-exist'))
  })

  test('a real folder resolves to itself', ({ assert }) => {
    const service = new ModuleInstallJobService()

    /**
     * The resolved value — an element of `readdirSync`'s output — is what
     * reaches `spawn`, never the request string. That is what makes traversal
     * structurally impossible rather than merely filtered.
     */
    assert.equal(service.resolveName('announcements'), 'announcements')
  })
})
