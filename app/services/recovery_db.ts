import pg from 'pg'

/**
 * A database connection for the recovery commands, opened without booting the
 * application.
 *
 * Every command that uses this exists for one situation: the app will not
 * start. Reaching for Lucid would mean booting the container, the providers and
 * every module — including the one that is preventing startup — so the tools
 * meant to fix a broken install would be broken by it. Raw `pg` against
 * `DATABASE_URL` is the only thing guaranteed to work when nothing else does.
 *
 * The same pattern is already used by `commands/migrate_from_legacy.ts`.
 */
export async function withRecoveryDb<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL ?? process.env.DRIFTLESS_DATABASE_URL

  if (!url) {
    throw new Error('DATABASE_URL is not set — cannot reach the database.')
  }

  /**
   * SQLite has no client here on purpose. These commands are for a running
   * installation, and a running installation is on Postgres; the SQLite path
   * exists only for the test suite, which has no broken-boot scenario to
   * recover from.
   */
  if (!url.startsWith('postgres')) {
    throw new Error(`Recovery commands need a PostgreSQL DATABASE_URL (got "${url.split(':')[0]}").`)
  }

  const client = new pg.Client({ connectionString: url })
  await client.connect()

  try {
    return await run(client)
  } finally {
    await client.end()
  }
}
