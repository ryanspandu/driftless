import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import ModulesService from '#services/modules_service'
import { LOCK_KEYS, withAdvisoryLock } from '#services/advisory_lock'

/**
 * Boot reconciliation under concurrency — **untestable on SQLite**, for the
 * reason given in `advisory_lock.spec.ts`: there are no advisory locks there, so
 * these assertions would pass while proving nothing.
 *
 * The failure this guards is not "one boot fails". Reconciliation is
 * find-or-create against unique indexes, so N workers starting together race
 * into duplicate-key errors; the provider used to rethrow, which sets
 * `exitCode = 1`, which makes the supervisor restart, which re-enters the
 * identical race. A permanent crash loop, from nothing but running two workers.
 *
 *   PG_TEST_URL=postgresql://postgres:postgres@localhost:5433/driftless_test \
 *     node ace test pg
 */

const PG_URL = process.env.PG_TEST_URL

test.group('Postgres | boot reconciliation', () => {
  test('four concurrent reconciles produce no duplicate-key error', async ({ assert }) => {
    const run = () =>
      withAdvisoryLock(
        LOCK_KEYS.bootReconcile,
        async () => {
          const modules = new ModulesService()
          await modules.reconcile()
          await modules.mintPermissions()
        },
        { onBusy: 'wait' }
      )

    const results = await Promise.allSettled([run(), run(), run(), run()])
    const rejected = results.filter((r) => r.status === 'rejected')

    assert.lengthOf(
      rejected,
      0,
      `expected no failures, got: ${rejected
        .map((r) => (r as PromiseRejectedResult).reason?.message)
        .join('; ')}`
    )
  }).skip(!PG_URL, 'PG_TEST_URL not set')

  test('the reconcile key does not exclude the migration key', async ({ assert }) => {
    /**
     * Different keys on purpose. Holding the migration lock must not stall boot
     * reconciliation, or a long `migration:run` from a terminal would keep every
     * worker from starting.
     */
    const trx = await db.transaction()
    try {
      const held = await trx.rawQuery(
        'SELECT pg_try_advisory_xact_lock(?) AS acquired',
        [LOCK_KEYS.migrations]
      )
      assert.isTrue(held?.rows?.[0]?.acquired)

      const outcome = await withAdvisoryLock(LOCK_KEYS.bootReconcile, async () => 'ran', {
        onBusy: 'skip',
      })

      assert.isTrue(outcome.ran)
      assert.equal(outcome.result, 'ran')
    } finally {
      await trx.rollback()
    }
  }).skip(!PG_URL, 'PG_TEST_URL not set')

  test('a held reconcile lock makes a skip-caller stand down', async ({ assert }) => {
    const trx = await db.transaction()
    try {
      await trx.rawQuery('SELECT pg_try_advisory_xact_lock(?)', [LOCK_KEYS.bootReconcile])

      let ranInside = false
      const outcome = await withAdvisoryLock(
        LOCK_KEYS.bootReconcile,
        async () => void (ranInside = true),
        { onBusy: 'skip' }
      )

      assert.isFalse(outcome.ran)
      assert.isFalse(ranInside)
    } finally {
      await trx.rollback()
    }
  }).skip(!PG_URL, 'PG_TEST_URL not set')
})
