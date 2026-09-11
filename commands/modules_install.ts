import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * Finish installing a module that was placed in `modules/` by hand.
 *
 *   node ace modules:install <name>
 *   node ace modules:install <name> --job=<id>   (spawned by the admin UI)
 *
 * Dropping a folder in is only the first step; the rest was previously left to
 * memory — run the migrations, rebuild the front-end if the package ships any,
 * enable it, restart. Forgetting the rebuild is the quiet one: the routes work,
 * the module reports itself enabled, and its admin pages are simply blank,
 * because Vite resolves the module glob at build time.
 *
 * The order matters: **migrate, build, then enable.** Enabling first would
 * expose a module whose tables do not exist yet.
 *
 * ## Why this always runs in its own process
 *
 * `MODULES` is resolved by a top-level `await` at import and
 * `config/database.ts` builds its migration path list when the config loads. A
 * folder that arrived after the web server booted is therefore invisible to it
 * twice over — `getModule()` returns undefined *and* its migrations are not in
 * the path list. Only a fresh process sees it. That is why the admin button
 * spawns this command rather than doing the work inline, and why the queue
 * worker cannot be used either: it boots the application the same way.
 */
export default class ModulesInstall extends BaseCommand {
  static commandName = 'modules:install'
  static description = 'Install a module that was placed in modules/ manually'

  /**
   * Needs the container: it reads the registry, runs migrations through
   * `SchemaInstallerService` and writes the `modules` row.
   */
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Module folder name' })
  declare name: string

  @flags.boolean({ description: 'Skip the front-end rebuild even if the module ships ui/' })
  declare skipBuild?: boolean

  @flags.string({ description: 'Install job id to report progress against (set by the admin UI)' })
  declare job?: string

  /** Rolling tail of the build output, mirrored into the job row. */
  #logTail: string[] = []
  #heartbeat: NodeJS.Timeout | null = null
  #step: string | null = null

  async run() {
    const { getModule } = await import('#modules/registry')
    const manifest = getModule(this.name)

    if (this.job) await this.startReporting()

    /**
     * Discovery refuses incompatible packages, so "not found" also covers
     * "found and rejected". The reason was printed at boot; point at it rather
     * than repeat the checks here and risk the two disagreeing.
     */
    if (!manifest) {
      return this.fail(
        'discover',
        'module_not_found',
        `No usable module named "${this.name}". Either the folder is missing, or discovery refused it — run \`node ace modules:list\` and check the log above it.`
      )
    }

    const { default: SchemaInstallerService } = await import('#services/schema_installer_service')
    const { default: ModulesService } = await import('#services/modules_service')

    // ── migrate ──────────────────────────────────────────────────────────────
    /**
     * `expectOwner` refuses when the named module has no pending migration — a
     * guard against `config/database.ts` resolving paths against a different
     * working directory and reporting a silent success. It is exactly wrong for
     * a module that ships **no migrations at all**, which is most plugins and
     * every freshly scaffolded module: asking it to prove work it never had
     * fails the install for doing nothing wrong.
     */
    const hasMigrations = existsSync(this.app.makePath(`modules/${this.name}/migrations`))
    await this.setStep('migrate')

    let applied: string[] = []

    this.logger.info(hasMigrations ? 'Applying migrations…' : 'No migrations to apply')
    try {
      const result = await new SchemaInstallerService().install(
        hasMigrations ? { expectOwner: this.name } : {}
      )
      applied = result.applied

      if (applied.length === 0) {
        this.logger.info('  nothing to migrate')
      } else {
        for (const migration of applied) this.logger.success(`  ${migration}`)
      }
    } catch (error) {
      return this.fail(
        'migrate',
        'migration_failed',
        `Migration failed: ${(error as Error).message}\nNothing was enabled. Fix the cause and run this again.`
      )
    }

    await this.audit('module.install_migrated', { applied })

    // ── build ────────────────────────────────────────────────────────────────
    const hasUi = existsSync(this.app.makePath(`modules/${this.name}/ui`))
    let releaseStamp: string | null = null

    if (hasUi && !this.skipBuild) {
      /**
       * Only when the package actually ships a front-end. A backend-only module
       * — a payment gateway, an integration — needs no rebuild at all, and
       * paying several minutes for one would be pure waste.
       */
      await this.setStep('build')
      this.logger.info('Rebuilding the front-end (this takes a few minutes)…')

      const startedAt = Date.now()

      try {
        await this.runStreaming('npm', ['run', 'release'])
      } catch {
        return this.fail(
          'build',
          'build_failed',
          'The build failed. The previous release is still live and untouched. Nothing was enabled.'
        )
      }

      const { currentReleaseStamp } = await import('#services/release')
      releaseStamp = currentReleaseStamp()

      await this.audit('module.install_built', { releaseStamp, durationMs: Date.now() - startedAt })
    } else if (hasUi) {
      this.logger.warning(
        "Skipping the build — this module's pages will be blank until you run `npm run release`."
      )
    } else {
      this.logger.info('No ui/ — no rebuild needed')
    }

    // ── enable ───────────────────────────────────────────────────────────────
    await this.setStep('enable')

    const modules = new ModulesService()
    await modules.reconcile()
    await modules.mintPermissions()
    await modules.setEnabled(this.name, true)

    await this.audit('module.install_enabled', {})

    this.logger.success(`${this.name} is installed and enabled.`)

    const { restartHint } = await import('#services/supervisor')
    this.logger.info(`Restart to serve it: ${restartHint()}`)

    if (this.job) {
      const { default: ModuleInstallJobService } = await import(
        '#services/module_install_job_service'
      )
      const service = new ModuleInstallJobService()
      const ModuleInstallJob = (await import('#models/module_install_job')).default
      const row = await ModuleInstallJob.find(this.job)

      if (row?.requiresRestart === false) {
        /**
         * Nothing to wait for: the web process already has this module loaded
         * and no assets changed, so it is live the moment the row flips.
         */
        await service.markSucceeded(this.job, applied)
        await this.audit('module.installed', { releaseStamp: null })
      } else {
        /**
         * Otherwise the job stops at `awaiting_restart` rather than "succeeded".
         * Whether it worked is decided *after* the restart by `resumeOnBoot`,
         * which is the only observer that can check the module now loads. A
         * process about to be replaced is in no position to certify its own
         * outcome.
         */
        await service.markAwaitingRestart(this.job, {
          appliedMigrations: applied,
          releaseStamp,
        })
      }
    }

    this.stopReporting()
  }

  // ── job reporting ──────────────────────────────────────────────────────────

  /**
   * Beat every five seconds so an install killed mid-build is detected rather
   * than holding the single active slot forever. This is why the build below
   * has to be a non-blocking `spawn`: `execFileSync` would freeze the event
   * loop for the whole build and no beat would ever fire.
   */
  private async startReporting(): Promise<void> {
    const service = await this.jobService()
    await service.markRunning(this.job!, process.pid)

    this.#heartbeat = setInterval(() => {
      void service.heartbeat(this.job!, this.#step, this.tail()).catch(() => {})
    }, 5_000)

    this.#heartbeat.unref()
  }

  private stopReporting(): void {
    if (!this.#heartbeat) return
    clearInterval(this.#heartbeat)
    this.#heartbeat = null
  }

  private async jobService() {
    const { default: ModuleInstallJobService } = await import(
      '#services/module_install_job_service'
    )
    return new ModuleInstallJobService()
  }

  private async setStep(step: string): Promise<void> {
    this.#step = step
    if (!this.job) return
    await (await this.jobService()).heartbeat(this.job, step, this.tail())
  }

  private tail(): string | null {
    if (this.#logTail.length === 0) return null
    return this.#logTail.join('').slice(-4000)
  }

  /**
   * Report a failure the same way whether it came from the CLI or the UI, and
   * exit non-zero either way.
   */
  private async fail(step: string, reason: string, message: string): Promise<void> {
    this.logger.error(message)
    this.exitCode = 1

    if (this.job) {
      await (await this.jobService()).markFailed(this.job, {
        step,
        reason,
        message,
        logTail: this.tail() ?? undefined,
      })
      await this.audit('module.install_failed', { step, reason })
    }

    this.stopReporting()
  }

  private async audit(action: string, changes: Record<string, unknown>): Promise<void> {
    if (!this.job) return

    const { default: AuditLogService } = await import('#services/audit_log_service')
    const ModuleInstallJob = (await import('#models/module_install_job')).default
    const row = await ModuleInstallJob.find(this.job)

    await new AuditLogService().record({
      /** No HttpContext and no user here — the operator is on the request row. */
      actor: { type: 'system', label: 'installer' },
      action,
      subjectType: 'module',
      subjectId: this.name,
      requestId: row?.requestId ?? null,
      changes: { jobId: this.job, ...changes },
    })
  }

  /**
   * Run a command, mirroring its output to our own stdout and into the tail.
   *
   * Awaited `spawn` rather than `execFileSync` so the event loop stays free for
   * the heartbeat. From a terminal the effect is identical to before — the
   * build's output still streams through as it happens.
   */
  private runStreaming(command: string, argv: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, argv, {
        cwd: this.app.appRoot.pathname,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      })

      const capture = (chunk: Buffer) => {
        const text = chunk.toString()
        process.stdout.write(text)

        this.#logTail.push(text)
        /** Bounded: keep the last few chunks, not the whole build log. */
        if (this.#logTail.length > 200) this.#logTail.splice(0, this.#logTail.length - 200)
      }

      child.stdout.on('data', capture)
      child.stderr.on('data', capture)

      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
    })
  }
}
