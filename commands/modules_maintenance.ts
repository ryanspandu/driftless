/**
 * Runs every enabled module's periodic housekeeping.
 *
 * Usage:  node ace modules:maintenance
 *         node ace modules:maintenance --only=ecommerce
 *
 * Meant for cron, every five minutes or so:
 *
 *   *\/5 * * * * cd /srv/driftless && node ace modules:maintenance >> /var/log/driftless-maintenance.log 2>&1
 *
 * Deliberately **not** a queue job. This is the work that decides who owns
 * stock and who gets paid — releasing reservations from abandoned checkouts,
 * maturing affiliate commissions, re-driving webhooks that failed their first
 * pass. All of it has to keep happening when Redis is down, which is exactly
 * when a queue-based scheduler would not.
 *
 * Safe to run concurrently with itself: every sweep is guarded by a conditional
 * UPDATE, so an overlapping run does nothing twice.
 */
import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { MODULES } from '#modules/registry'
import ModulesService from '#services/modules_service'

export default class ModulesMaintenance extends BaseCommand {
  static commandName = 'modules:maintenance'
  static description = "Run enabled modules' periodic housekeeping sweeps"

  /**
   * `startApp: true` because the sweeps need the database, the container and
   * every service the app registers — the same environment an HTTP request
   * gets. `staysAlive` is deliberately absent: this runs and exits, which is
   * what cron expects.
   */
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Run only this module (default: all enabled)' })
  declare only?: string

  async run() {
    const modules = new ModulesService()
    const enabled = await modules.enabledMap()

    /**
     * Disabled modules are skipped, not failed. An operator who switched a
     * module off should not then see its cron entry reporting errors every five
     * minutes — and a module that is off has no business touching its tables.
     */
    const candidates = MODULES.filter((mod) => {
      if (typeof mod.maintenance !== 'function') return false
      if (this.only && mod.name !== this.only) return false
      return enabled.get(mod.name) === true
    })

    if (this.only && !MODULES.some((mod) => mod.name === this.only)) {
      this.logger.error(`No module named "${this.only}".`)
      this.exitCode = 1
      return
    }

    if (candidates.length === 0) {
      this.logger.info('Nothing to do — no enabled module declares maintenance work.')
      return
    }

    let failed = 0

    for (const mod of candidates) {
      try {
        const summary = await mod.maintenance!()
        const detail = Object.entries(summary)
          .filter(([, count]) => count > 0)
          .map(([key, count]) => `${key}=${count}`)
          .join(' ')

        this.logger.success(`${mod.name}: ${detail || 'nothing to do'}`)
      } catch (error) {
        /**
         * One module's failure must not stop the next one's sweep — a broken
         * e-commerce webhook should never be the reason some other module's
         * stock stays locked.
         */
        failed++
        this.logger.error(`${mod.name}: ${(error as Error).message}`)
      }
    }

    /**
     * A non-zero exit so cron's own failure reporting fires. Without it a sweep
     * that has been throwing for a week looks exactly like one that has been
     * working.
     */
    await this.pruneBackups()

    if (failed > 0) this.exitCode = 1
  }

  /**
   * Delete uninstall backups older than 30 days.
   *
   * `modules:uninstall --remove-folder` moves a folder aside rather than
   * deleting it, which is the right call at the moment of uninstall and the
   * wrong one forever — without a sweep the disk fills with packages nobody
   * will restore. A month is long enough to notice a mistake.
   */
  private async pruneBackups() {
    const { existsSync, readdirSync, rmSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')

    const backups = this.app.makePath('shared/backups')
    if (!existsSync(backups)) return

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000

    for (const entry of readdirSync(backups)) {
      const path = join(backups, entry)
      try {
        if (statSync(path).mtimeMs >= cutoff) continue
        rmSync(path, { recursive: true, force: true })
        this.logger.info(`pruned backup ${entry}`)
      } catch {
        // A backup we cannot stat or remove is not worth failing the sweep for.
      }
    }
  }
}
