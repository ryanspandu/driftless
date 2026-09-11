import app from '@adonisjs/core/services/app'

/**
 * Cross-process mutual exclusion, for the handful of operations that must not
 * run twice at once anywhere in a deployment.
 *
 * ## Key registry
 *
 * Keys are global to the database, so they have to be allocated here rather
 * than chosen at each call site.
 *
 * | Key | Guards |
 * |-----|--------|
 * | `1` | Applying migrations. **Deliberately the same key `node ace migration:run` uses**, so the CLI and the admin installer exclude each other rather than racing. |
 * | `2` | Boot reconciliation — the modules registry and the CMS native collections. |
 * | `3` | Resuming an interrupted install job. |
 *
 * ## Why a transaction rather than Lucid's lock
 *
 * PostgreSQL advisory locks are *session*-scoped, and Lucid's built-in lock
 * acquires from an arbitrary pooled connection — so the release can land on a
 * different socket than the acquire, silently failing and leaking the lock.
 * `db.transaction()` pins one connection for the duration, and
 * `pg_try_advisory_xact_lock` releases automatically on commit or rollback,
 * **including if the process dies**. It cannot leak.
 */
export const LOCK_KEYS = {
  migrations: 1,
  bootReconcile: 2,
  installResume: 3,
} as const

export type LockBusyBehaviour = 'throw' | 'skip' | 'wait'

export interface AdvisoryLockOptions {
  /**
   * What to do when someone else holds the lock.
   *
   * - `throw` — surface it. For user-initiated work where "someone else is
   *   already doing this" is the honest answer.
   * - `skip` — return `{ ran: false }`. For work that only needs to happen once
   *   across the fleet and does not care who does it.
   * - `wait` — retry the non-blocking acquire a bounded number of times, then
   *   fall through to `skip`. **Never blocks indefinitely**, because every
   *   current caller is on a boot path and a boot that waits forever is a
   *   deployment that never comes up.
   */
  onBusy?: LockBusyBehaviour
  /** Only meaningful for `wait`. */
  retries?: number
  retryDelayMs?: number
  /** Message and machine-readable reason used when `onBusy` is `throw`. */
  busyMessage?: string
  busyReason?: string
}

export interface AdvisoryLockResult<T> {
  ran: boolean
  result?: T
}

/**
 * Resolve Lucid from the container rather than importing
 * `@adonisjs/lucid/services/db`.
 *
 * That service module is only populated on `app.booted()`, which fires **after
 * every provider's `boot()` has finished** — and the first callers here are
 * boot hooks. Importing it gives `undefined` and the application dies before it
 * ever listens. Both providers that use this already reach for the container
 * for the same reason.
 */
async function database() {
  return app.container.make('lucid.db')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `fn` while holding the advisory lock for `key`.
 *
 * On any non-PostgreSQL connection the callback runs directly: SQLite has no
 * advisory locks and is single-writer by nature, and silently changing the
 * shape of the operation under test would be worse than not locking.
 */
export async function withAdvisoryLock<T>(
  key: number,
  fn: () => Promise<T>,
  options: AdvisoryLockOptions = {}
): Promise<AdvisoryLockResult<T>> {
  const { onBusy = 'throw', retries = 20, retryDelayMs = 250 } = options

  const db = await database()

  if (db.connection().dialect.name !== 'postgres') {
    return { ran: true, result: await fn() }
  }

  const attempts = onBusy === 'wait' ? retries : 1

  for (let attempt = 0; attempt < attempts; attempt++) {
    const trx = await db.transaction()
    try {
      const query = await trx.rawQuery('SELECT pg_try_advisory_xact_lock(?) AS acquired', [key])
      const acquired = query?.rows?.[0]?.acquired === true

      if (acquired) {
        return { ran: true, result: await fn() }
      }
    } finally {
      /**
       * Commit either way. The transaction carries no writes of its own — it
       * exists only to pin the lock to a single connection — so committing and
       * rolling back are equivalent, and commit is the cheaper signal to a
       * connection pooler.
       */
      await trx.commit()
    }

    if (attempt < attempts - 1) await sleep(retryDelayMs)
  }

  if (onBusy === 'throw') {
    const { publicError } = await import('#exceptions/public_error')
    throw publicError.conflict(
      options.busyMessage ?? 'Another process is already doing this. Try again shortly.',
      options.busyReason ?? 'lock_unavailable'
    )
  }

  return { ran: false }
}
