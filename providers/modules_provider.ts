import type { ApplicationService } from '@adonisjs/core/types'
import ModulesService from '#services/modules_service'
import { bootFailures, bootModules } from '#modules/registry'
import { LOCK_KEYS, withAdvisoryLock } from '#services/advisory_lock'
import ModuleInstallJobService from '#services/module_install_job_service'
import { startRestartWatcher } from '#services/restart_watcher'

/**
 * Reconciles the module registry against the `modules` table on boot, mints each
 * module's permissions into the RBAC tables, and runs each enabled module's
 * optional boot hook.
 */
export default class ModulesProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const environment = this.app.getEnvironment()
    if (environment !== 'web' && environment !== 'console' && environment !== 'test') {
      return
    }

    const db = await this.app.container.make('lucid.db')
    const hasModulesTable = await db.connection().schema.hasTable('modules')
    if (!hasModulesTable) {
      return
    }

    try {
      const modules = new ModulesService()

      /**
       * Reconciliation is find-or-create against unique indexes, so N processes
       * cold-starting together race each other into duplicate-key errors. That
       * matters far more than it sounds: the throw below sets `exitCode = 1`,
       * the supervisor restarts, and the restart re-enters the identical race —
       * a permanent crash loop from nothing but starting two workers at once.
       *
       * `wait` rather than `skip`: whoever loses still needs the rows to exist
       * before it reads `enabledMap()` below.
       */
      await withAdvisoryLock(
        LOCK_KEYS.bootReconcile,
        async () => {
          await modules.reconcile()

          const hasPermissions = await db.connection().schema.hasTable('permissions')
          if (hasPermissions) {
            await modules.mintPermissions()
          }
        },
        { onBusy: 'wait' }
      )

      /**
       * Boot hooks run **outside** the lock, deliberately. Every worker has to
       * run its own — they register routes and job handlers in that process —
       * and holding a database lock across arbitrary module code is how a
       * single slow module turns into a fleet-wide boot stall.
       */
      const enabled = await modules.enabledMap()
      await bootModules(this.app, (name) => enabled.get(name) ?? false)

      /**
       * Quarantine anything that threw in `boot()`.
       *
       * Written to the database, not just logged, so the next boot skips it
       * instead of repeating the same failure forever — and so the admin can
       * show the operator *why* a module switched itself off rather than
       * leaving them to guess. Re-enabling is a deliberate act once the
       * underlying problem is fixed.
       */
      for (const [name, reason] of bootFailures) {
        await modules.quarantine(name, reason)
      }

      /**
       * Module lifecycle already lives in this provider, and both of these are
       * part of it: finish any install that was interrupted by the restart it
       * asked for, then watch for the next one.
       *
       * Web only. An ace command booting the app must not decide the fleet's
       * install outcomes or restart itself.
       */
      if (environment === 'web') {
        await new ModuleInstallJobService().resumeOnBoot()
        startRestartWatcher()
      }
    } catch (error) {
      // Test DB is migrated per-suite; tables may not exist at app boot yet.
      if (environment === 'test') return

      /**
       * A unique violation here means we lost a reconcile race despite the
       * lock — so the row we were trying to create already exists, which is the
       * outcome we wanted. Swallow it.
       *
       * The lock above should make this unreachable. It is kept because the
       * failure it guards against is not "one boot fails" but a supervisor
       * restart loop that never recovers on its own, and three lines is cheap
       * insurance against a dead site.
       */
      if ((error as { code?: string }).code === '23505') {
        console.warn('[modules] reconcile lost a race; another process already wrote the row')
        return
      }

      /**
       * Only infrastructure failures reach here now — an unreachable database,
       * a missing table. A module's own fault is caught inside `bootModules`
       * and can no longer stop the application, which is the whole point: an
       * operator locked out by a bad package has no way to remove it.
       */
      throw error
    }
  }
}
