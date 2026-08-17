import app from '@adonisjs/core/services/app'
import { MigrationRunner } from '@adonisjs/lucid/migration'
import PublicError, { publicError } from '#exceptions/public_error'
import { LOCK_KEYS, withAdvisoryLock } from '#services/advisory_lock'

/**
 * Applies pending database migrations from an authenticated admin request, so
 * installing a module does not require shell access.
 *
 * ## The constraint that shapes everything here
 *
 * Lucid's migrator **cannot be scoped to one directory**. `MigratorOptions` has
 * only `direction`, `connectionName`, `schemaPath`, `dryRun` and `disableLocks`;
 * `MigrationSource.getMigrationsPaths()` reads `config.migrations.paths`
 * wholesale, and that array is fixed at config load. So one `run()` applies
 * *every* pending migration across core and all modules.
 *
 * We accept that rather than fight it. The alternative — a bespoke per-module
 * DDL runner with its own bookkeeping — would leave module tables invisible to
 * `adonis_schema`, giving the project two parallel migration systems where
 * `node ace migration:run` and `migration:rollback` no longer know the whole
 * truth. Instead, {@link pending} lets the UI show exactly what will run, and
 * the operator confirms it.
 *
 * ## Why not just call the migrator
 *
 * Several sharp edges in Lucid's runner make a naive call unsafe from HTTP:
 *
 *  - `migrator.close()` calls `db.manager.closeAll(true)`, which deregisters
 *    every connection. Calling it in a request permanently breaks the process:
 *    every later query throws `E_UNMANAGED_DB_CONNECTION`. The ace command gets
 *    away with it only because the process is about to exit. **We never call it.**
 *  - The built-in advisory lock uses the hardcoded key `1` acquired from an
 *    arbitrary pooled connection, but PostgreSQL advisory locks are
 *    session-scoped. Acquire on one pooled socket and release on another and
 *    the release silently fails, throwing `E_UNABLE_RELEASE_LOCK` from
 *    `shutdown()` — which sits *outside* `run()`'s try/catch — while leaking
 *    the lock. It is also re-entrant within a session, so two concurrent
 *    runners in one process can both proceed. We take our own lock instead.
 *  - `run()` swallows migration failures into `migrator.error` rather than
 *    throwing, so the result must be inspected explicitly.
 */

/** Where a pending migration comes from, for grouping in the UI. */
export type MigrationOrigin = 'core' | 'module'

export interface PendingMigration {
  /** App-relative path without extension, as recorded in `adonis_schema`. */
  name: string
  origin: MigrationOrigin
  /** Module folder name; null for core. */
  owner: string | null
}

export interface InstallResult {
  applied: string[]
  durationMs: number
}

/**
 * In-process single-flight guard.
 *
 * The database lock below handles concurrency between processes; this handles
 * it *within* one, where the advisory lock's session re-entrancy would let a
 * second caller straight through.
 */
let inFlight: Promise<InstallResult> | null = null

/**
 * Resolve Lucid from the container rather than importing
 * `@adonisjs/lucid/services/db`.
 *
 * That service module only assigns its export on `app.booted()`, which fires
 * **after every provider's `boot()` has finished** — and `tablesReady()` is
 * called from `ModulesProvider.boot()` during reconcile. Importing it gives
 * `undefined` there, and only on a *fresh* database, because reconcile asks
 * about tables solely for modules that have no row yet. Same reason
 * `advisory_lock.ts` and both providers reach for the container.
 */
async function database() {
  return app.container.make('lucid.db')
}

function classify(name: string): PendingMigration {
  const moduleMatch = name.match(/^modules\/([^/]+)\//)
  if (moduleMatch) return { name, origin: 'module', owner: moduleMatch[1]! }


  return { name, origin: 'core', owner: null }
}

export default class SchemaInstallerService {
  /**
   * Migrations that have not run yet.
   *
   * `getList()` creates `adonis_schema` if it is missing and takes no lock, so
   * this is safe to call on every page load.
   */
  async pending(): Promise<PendingMigration[]> {
    const migrator = new MigrationRunner(await database(), app, {
      direction: 'up',
      dryRun: true,
    })
    const list = await migrator.getList()
    return list.filter((row) => row.status === 'pending').map((row) => classify(row.name))
  }

  /** Do all of `tables` exist? Used to decide whether a module is installed. */
  async tablesReady(tables: string[]): Promise<boolean> {
    if (tables.length === 0) return true

    /**
     * One query for the whole list, not one per table.
     *
     * This used to loop `hasTable`, which meant the settings page paid a round
     * trip per declared table — 31 of them for e-commerce alone, on every load,
     * and worse with every app a marketplace adds.
     *
     * The loop also carried a real trap worth recording even though the code is
     * gone: it built a **fresh** schema builder each iteration, because knex
     * builders are stateful and single-use. Reusing one accumulates statements,
     * so the second `hasTable` on the same instance stops resolving to a plain
     * boolean and every table starts looking like it exists. Asking the
     * catalogue directly sidesteps the whole hazard.
     */
    const existing = await this.existingTables(tables)

    return tables.every((table) => existing.has(table))
  }

  /**
   * Which of `names` exist, read from the database's own catalogue.
   *
   * Postgres and SQLite disagree on where that lives, and there is no Lucid
   * abstraction for a bulk existence check — `hasTable` is singular by design.
   */
  private async existingTables(names: string[]): Promise<Set<string>> {
    const connection = (await database()).connection()

    if (connection.dialect.name === 'postgres') {
      const result = await connection.rawQuery(
        `SELECT tablename AS name FROM pg_catalog.pg_tables
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            AND tablename = ANY(?)`,
        [names]
      )
      return new Set((result.rows ?? []).map((row: { name: string }) => row.name))
    }

    /**
     * SQLite. `sqlite_master` holds indexes and triggers too, so the type
     * filter is not optional — an index sharing a table's name would otherwise
     * report the table as present.
     */
    const rows = await connection
      .from('sqlite_master')
      .where('type', 'table')
      .whereIn('name', names)
      .select('name')

    return new Set(rows.map((row: { name: string }) => row.name))
  }

  /** Migration names `adonis_schema` currently records as run. */
  private async migratedNames(): Promise<Set<string>> {
    const rows = await (await database()).from('adonis_schema').select('name')
    return new Set(rows.map((row: { name: string }) => row.name))
  }

  /**
   * What the migrator actually recorded during this run.
   *
   * `applied` used to be the *pre-run pending list* — the set we intended to
   * apply, returned verbatim whether or not the migrator got through it. Since
   * `run()` swallows its own errors (the reason `execute()` inspects
   * `migrator.error` by hand), a partial run reported every migration as
   * applied. An installer that trusts that will enable a module whose tables do
   * not exist.
   */
  private async appliedSince(before: Set<string>): Promise<string[]> {
    const after = await this.migratedNames()
    return [...after].filter((name) => !before.has(name)).sort()
  }

  /**
   * Has the database ever been migrated at all?
   *
   * Guards against Lucid's schema-dump bootstrap path: when `adonis_schema` has
   * zero rows and a `database/schema/<connection>-schema.sql` dump exists,
   * `prepareDatabaseForUp()` **drops `adonis_schema` and `adonis_schema_versions`**
   * before loading the dump. That is a legitimate CLI operation on a fresh
   * database and an absolutely unacceptable one behind an admin button.
   */
  private async hasBeenMigrated(): Promise<boolean> {
    const lucid = await database()
    const schema = lucid.connection().schema
    if (!(await schema.hasTable('adonis_schema'))) return false
    const row = await lucid.from('adonis_schema').select('id').first()
    return Boolean(row)
  }

  /**
   * Apply every pending migration.
   *
   * @param expectOwner When set, refuse unless a migration belonging to this
   *   module is actually pending. Catches the silent-success case where
   *   `config/database.ts` resolved its paths against a different CWD than
   *   `MigrationSource` resolves against `app.appRoot`, leaving the path list
   *   empty — `run()` then reports success having done nothing at all.
   */
  async install(options: { expectOwner?: string } = {}): Promise<InstallResult> {
    if (inFlight) {
      throw publicError.conflict(
        'A database installation is already running. Wait for it to finish.',
        'install_in_progress'
      )
    }

    const promise = this.runInstall(options)
    inFlight = promise
    try {
      return await promise
    } finally {
      inFlight = null
    }
  }

  private async runInstall(options: { expectOwner?: string }): Promise<InstallResult> {
    if (!(await this.hasBeenMigrated())) {
      throw publicError.unprocessable(
        'This database has never been migrated. Run "node ace migration:run" once from a terminal first.',
        'database_not_initialised'
      )
    }

    const pending = await this.pending()

    /**
     * Checked *before* the empty-list shortcut, deliberately.
     *
     * "Install this module" with nothing pending for it is the exact symptom of
     * the failure this guard exists for: `config/database.ts` resolves its
     * migration paths against the process CWD while `MigrationSource` resolves
     * against `app.appRoot`, so when those differ the path list comes back
     * empty and `run()` reports success having done nothing at all. Returning
     * "applied: []" there would tell the operator it worked.
     */
    if (options.expectOwner && !pending.some((m) => m.owner === options.expectOwner)) {
      throw publicError.unprocessable(
        `No pending migrations were found for "${options.expectOwner}". Its migrations directory may not be visible to this process — restart the server and try again.`,
        'owner_migrations_not_found'
      )
    }

    if (pending.length === 0) {
      return { applied: [], durationMs: 0 }
    }

    const startedAt = Date.now()

    /**
     * What was already recorded before we ran, so the result can report what
     * actually landed rather than what we hoped would.
     */
    const before = await this.migratedNames()

    /**
     * Hold the migration lock for the whole run.
     *
     * On SQLite `withAdvisoryLock` runs the callback directly — there are no
     * advisory locks to take, the in-process guard above still applies, and
     * SQLite deployments are single-writer by nature.
     */
    await withAdvisoryLock(LOCK_KEYS.migrations, () => this.execute(), {
      onBusy: 'throw',
      busyMessage:
        'Another migration is already running (possibly from a terminal). Try again shortly.',
      busyReason: 'migration_lock_unavailable',
    })

    return { applied: await this.appliedSince(before), durationMs: Date.now() - startedAt }
  }

  /** Run the migrator and turn its result into an exception on failure. */
  private async execute(): Promise<void> {
    const migrator = new MigrationRunner(await database(), app, {
      direction: 'up',
      // We hold our own lock; letting Lucid also try would fail (its
      // non-blocking acquire would see ours) and then throw from `shutdown()`.
      disableLocks: true,
    })

    try {
      await migrator.run()
    } catch (error) {
      // `run()` normally swallows migration errors, but `shutdown()` runs
      // outside its try/catch and can still throw.
      throw new PublicError(`Migration failed: ${(error as Error).message}`, {
        status: 500,
        reason: 'migration_failed',
      })
    }

    if (migrator.error) {
      throw new PublicError(`Migration failed: ${migrator.error.message}`, {
        status: 500,
        reason: 'migration_failed',
      })
    }

    if (migrator.status === 'error') {
      throw new PublicError('Migration failed.', { status: 500, reason: 'migration_failed' })
    }

    // Deliberately NOT calling `migrator.close()` — see the class docblock.
  }

  /**
   * Drop a module's tables and forget its migrations so it can be reinstalled.
   *
   * `migration:rollback` cannot be used: its only scoping is `batch` / `step`
   * over reverse-insertion order across *all* configured paths, so rolling back
   * a module would take unrelated core migrations with it. Instead we drop the
   * tables the manifest declares and delete just this owner's `adonis_schema`
   * rows.
   *
   * Removing those rows is the one place this codebase touches Lucid's
   * bookkeeping, and it is required: leaving them behind while the tables are
   * gone makes reinstalling impossible, because the migrator would consider
   * them already applied.
   */
  async uninstall(options: {
    name: string
    tables: string[]
  }): Promise<{ droppedTables: string[]; forgottenMigrations: number }> {
    const { name, tables } = options

    if (tables.length === 0) {
      throw publicError.unprocessable(
        `"${name}" does not declare the tables it owns, so it cannot be uninstalled automatically.`,
        'tables_not_declared'
      )
    }

    const prefix = `modules/${name}/migrations/%`
    const dropped: string[] = []

    const trx = await (await database()).transaction()
    try {
      // Drop in reverse declaration order so a child table goes before the
      // parent it references.
      for (const table of [...tables].reverse()) {
        if (await trx.schema.hasTable(table)) {
          await trx.schema.dropTable(table)
          dropped.push(table)
        }
      }

      const forgotten = await trx.from('adonis_schema').where('name', 'like', prefix).delete()

      await trx.commit()
      return {
        droppedTables: dropped,
        forgottenMigrations: Array.isArray(forgotten) ? forgotten.length : Number(forgotten ?? 0),
      }
    } catch (error) {
      await trx.rollback()
      throw new PublicError(`Uninstall failed: ${(error as Error).message}`, {
        status: 500,
        reason: 'uninstall_failed',
      })
    }
  }
}
