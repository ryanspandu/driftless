import { test } from '@japa/runner'
import SchemaInstallerService from '#services/schema_installer_service'

/**
 * The concurrency guards, which **cannot be tested on SQLite**.
 *
 * `supportsAdvisoryLocks` is false there, so the installer skips the whole
 * second layer and these assertions would pass vacuously. That is exactly the
 * shape of test worth refusing to write: green, and proving nothing.
 *
 * Gated on `PG_TEST_URL`. CI runs it against the Postgres in
 * `docker-compose.yml`; locally it skips.
 *
 *   PG_TEST_URL=postgresql://postgres:postgres@localhost:5433/driftless_test \
 *     node ace test pg
 */

const PG_URL = process.env.PG_TEST_URL

test.group('Postgres | install concurrency', (group) => {
  group.each.setup(() => {
    if (!PG_URL) throw new Error('skip')
  })

  test('two concurrent installs — exactly one proceeds', async ({ assert }) => {
    const installer = new SchemaInstallerService()

    /**
     * Started together on purpose. The in-process single-flight guard is the
     * layer being exercised here: the database advisory lock is session
     * re-entrant, so two callers in the *same* process would otherwise both
     * sail through and run the migrator twice.
     */
    const results = await Promise.allSettled([installer.install({}), installer.install({})])

    const rejected = results.filter((r) => r.status === 'rejected')

    assert.lengthOf(rejected, 1)
    assert.include(
      String((rejected[0] as PromiseRejectedResult).reason?.message ?? ''),
      'already'
    )
  }).skip(!PG_URL, 'PG_TEST_URL not set')

  test('the advisory key is the one the CLI uses', async ({ assert }) => {
    const db = await import('@adonisjs/lucid/services/db')

    /**
     * Key `1` is deliberate and shared with `node ace migration:run`, so a
     * terminal migration and an in-app install exclude each other. Holding it
     * here must make the installer refuse rather than run concurrently.
     */
    const trx = await db.default.transaction()
    try {
      const held = await trx.rawQuery('SELECT pg_try_advisory_xact_lock(1) AS acquired')
      assert.isTrue(held?.rows?.[0]?.acquired)

      await assert.rejects(() => new SchemaInstallerService().install({}), /already running/)
    } finally {
      await trx.rollback()
    }
  }).skip(!PG_URL, 'PG_TEST_URL not set')
})
