import { spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync } from 'node:fs'
import { freemem } from 'node:os'
import { join } from 'node:path'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import ModuleInstallJob, { ACTIVE_LOCK } from '#models/module_install_job'
import Module from '#models/module'
import AuditLogService from '#services/audit_log_service'
import { LOCK_KEYS, withAdvisoryLock } from '#services/advisory_lock'
import { publicError } from '#exceptions/public_error'
import { currentReleaseStamp } from '#services/release'
import { restartKind, supervisorMode } from '#services/supervisor'
import { newUlid } from '#services/ulid_service'
import { getModule } from '#modules/registry'
import { scanModuleFolders } from '#modules/paths'

/** Whether *this* process imported the module at boot. */
function isLoaded(name: string): boolean {
  return Boolean(getModule(name))
}

/**
 * How long a job may go without a heartbeat before it is presumed dead.
 *
 * The child beats every five seconds, so a minute is twelve missed beats — long
 * enough to survive a stalled `npm` and short enough that a killed installer
 * does not hold the single active slot until someone notices.
 */
const HEARTBEAT_TIMEOUT_MS = 60_000

/**
 * Refuse to start a build below this much free memory.
 *
 * A Vite build here peaks well above a gigabyte. On the 1 GB VPS this project
 * targets, starting one anyway does not fail cleanly — the OOM killer picks a
 * victim by score, and that victim is as likely to be Postgres as the build. A
 * refusal the operator can read beats an outage they have to diagnose.
 */
const MIN_FREE_MEM_MB = Number(process.env.DRIFTLESS_MIN_FREE_MEM_MB ?? 1536)

export interface StartInstallInput {
  module: string
  userId?: number | null
  requestId?: string | null
}

export interface StartedJob {
  jobId: string
  requiresBuild: boolean
  requiresRestart: boolean
}

export default class ModuleInstallJobService {
  /**
   * The source checkout, which is where `ace.js` lives and where the installer
   * child has to run.
   *
   * `process.cwd()` really is the checkout under all three shipped supervisor
   * configs (`ecosystem.config.cjs` sets `cwd`, the systemd units set
   * `WorkingDirectory`, the Dockerfile sets `WORKDIR`). It is still validated
   * rather than trusted: we are about to execute out of it.
   */
  sourceRoot(): string {
    const root = process.env.DRIFTLESS_SOURCE_ROOT ?? process.cwd()

    if (!existsSync(join(root, 'ace.js'))) {
      throw publicError.unprocessable(
        `Cannot find the Driftless checkout (looked in ${root}). Set DRIFTLESS_SOURCE_ROOT if it lives somewhere else.`,
        'source_root_not_found'
      )
    }

    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { name?: string }
      if (pkg.name !== 'driftless') throw new Error('wrong package')
    } catch {
      throw publicError.unprocessable(
        `${root} does not look like a Driftless checkout. Refusing to run anything from it.`,
        'source_root_invalid'
      )
    }

    return root
  }

  /** Folders present on disk, whether or not this process loaded them. */
  detected(): string[] {
    return scanModuleFolders()
  }

  /**
   * Resolve a requested name against what is actually on disk.
   *
   * The returned string — never the request's — is what reaches `spawn`. It is
   * an element of `readdirSync`'s output, so it cannot contain a path
   * separator or `..` no matter what was asked for.
   */
  resolveName(requested: string): string {
    const match = this.detected().find((name) => name === requested)

    if (!match) {
      throw publicError.notFound(
        `No module folder named "${requested}" was found in modules/.`,
        'module_folder_not_found'
      )
    }

    return match
  }

  /** Whether the package ships a front-end, and therefore needs a rebuild. */
  requiresBuild(name: string): boolean {
    return existsSync(join(app.makePath('modules'), name, 'ui'))
  }

  /**
   * Whether finishing this install needs the process to cycle.
   *
   * Two reasons, and only two. A rebuild means the assets this process serves
   * are about to be replaced. A module this process never imported means
   * `MODULES` cannot see it, and that array is fixed at import.
   *
   * Neither applies to the common case — a module that is already loaded and
   * simply has no tables yet — and it is worth getting right rather than
   * restarting defensively: telling an operator their site will blink when it
   * will not is the same class of dishonesty as the reverse.
   */
  requiresRestart(name: string): boolean {
    return this.requiresBuild(name) || !isLoaded(name)
  }

  /** The active job, if there is one. At most one can exist — see the migration. */
  async active(): Promise<ModuleInstallJob | null> {
    return ModuleInstallJob.query().whereNotNull('active_lock').first()
  }

  /**
   * The job the admin UI should be showing: the active one, or the most recent
   * finished one, so a result survives a page reload and is visible to whoever
   * looks — including a different admin than the one who started it.
   */
  async latest(withinMinutes = 10): Promise<ModuleInstallJob | null> {
    const running = await this.active()
    if (running) return running

    return ModuleInstallJob.query()
      .whereNotNull('finished_at')
      .where('finished_at', '>', DateTime.now().minus({ minutes: withinMinutes }).toSQL())
      .orderBy('finished_at', 'desc')
      .first()
  }

  /**
   * Record the intent and hand the work to a detached child.
   *
   * The child is not an optimisation. `MODULES` is resolved by a top-level
   * `await` at import, and `config/database.ts` builds its migration paths when
   * the config is loaded — so a folder that arrived after boot is invisible to
   * this process in both places at once. `getModule(name)` returns undefined and
   * its migrations are not even in the path list. Only a fresh process can see
   * it, which rules out doing this inline *and* rules out the queue worker,
   * which boots the app the same way.
   */
  async start(input: StartInstallInput): Promise<StartedJob> {
    const name = this.resolveName(input.module)
    const sourceRoot = this.sourceRoot()
    const requiresBuild = this.requiresBuild(name)
    const requiresRestart = this.requiresRestart(name)

    if (requiresBuild) this.assertEnoughMemory()

    const jobId = newUlid()

    /**
     * The insert *is* the lock. A unique index on `active_lock` means the second
     * concurrent caller fails here rather than starting a build that would race
     * the first over `build/`, `releases/` and the migrator.
     */
    try {
      await ModuleInstallJob.create({
        id: jobId,
        moduleName: name,
        state: 'queued',
        activeLock: ACTIVE_LOCK,
        requiresBuild,
        requiresRestart,
        restartKind: requiresRestart ? restartKind() : null,
        requestedByUserId: input.userId ?? null,
        requestId: input.requestId ?? null,
      })
    } catch (error) {
      const existing = await this.active()
      if (existing) {
        throw publicError.conflict(
          `An install of "${existing.moduleName}" is already running. Wait for it to finish.`,
          'install_in_progress'
        )
      }
      throw error
    }

    /**
     * Written here, synchronously, before any work starts — and it is the only
     * audit row that can carry the operator's identity. The child has no
     * `HttpContext` and no user; everything it writes afterwards is attributed
     * to the system. This row is also the record of *what we told the operator
     * would happen*, which is what makes the trail useful when the outcome
     * surprises them.
     */
    await new AuditLogService().record({
      actor: input.userId ? { type: 'system', label: `user:${input.userId}` } : { type: 'system' },
      action: 'module.install_requested',
      subjectType: 'module',
      subjectId: name,
      requestId: input.requestId ?? null,
      changes: {
        jobId,
        module: name,
        requiresBuild,
        requiresRestart,
        supervisor: supervisorMode(),
        restartKind: requiresRestart ? restartKind() : null,
      },
    })

    this.spawnRunner(sourceRoot, name, jobId)

    return { jobId, requiresBuild, requiresRestart }
  }

  private assertEnoughMemory(): void {
    const freeMb = Math.round(freemem() / 1024 / 1024)
    if (freeMb >= MIN_FREE_MEM_MB) return

    throw publicError.unprocessable(
      `Not enough free memory to rebuild the front-end: ${freeMb} MB available, ${MIN_FREE_MEM_MB} MB needed. ` +
        `Stop something else first, or add swap — a build that runs out of memory can take the database down with it.`,
      'insufficient_memory'
    )
  }

  private spawnRunner(sourceRoot: string, name: string, jobId: string): void {
    /**
     * The parent opens the log file and hands the descriptor over, rather than
     * piping. With `detached` + `unref()`, a parent that exits — which is the
     * *expected* ending here, since the last step is a restart — closes its pipe
     * ends and the child dies of `EPIPE` mid-build. Handing over an fd takes the
     * parent out of the data path entirely.
     */
    const logPath = app.tmpPath(`install-${jobId}.log`)
    const log = openSync(logPath, 'a')

    const env = { ...process.env }

    /**
     * Scrub the supervisor's fingerprints.
     *
     * Without this the child's `isSupervised()` returns true, and a child that
     * ever exits believing something will restart it is a silent orphan. The
     * socket variables go too, so it is structurally unable to claim the web
     * server's listening descriptor.
     */
    for (const key of ['LISTEN_FDS', 'LISTEN_PID', 'NOTIFY_SOCKET', 'pm_id', 'INVOCATION_ID']) {
      delete env[key]
    }
    env.DRIFTLESS_INSTALL_JOB = jobId

    const child = spawn(
      /** Absolute, never `'node'` off `PATH`. */
      process.execPath,
      [join(sourceRoot, 'ace.js'), 'modules:install', name, `--job=${jobId}`],
      {
        cwd: sourceRoot,
        env,
        detached: true,
        stdio: ['ignore', log, log],
        shell: false,
      }
    )

    child.unref()
  }

  // ── the child's own bookkeeping ───────────────────────────────────────────

  async markRunning(jobId: string, pid: number): Promise<void> {
    await ModuleInstallJob.query().where('id', jobId).update({
      state: 'running',
      pid,
      started_at: DateTime.now().toSQL(),
      heartbeat_at: DateTime.now().toSQL(),
    })
  }

  async heartbeat(jobId: string, step: string | null, logTail: string | null): Promise<void> {
    await ModuleInstallJob.query()
      .where('id', jobId)
      .update({
        heartbeat_at: DateTime.now().toSQL(),
        ...(step ? { step } : {}),
        ...(logTail ? { log_tail: logTail } : {}),
      })
  }

  /**
   * The child has done everything it can. Whether it worked is decided after the
   * restart, by `resumeOnBoot` — which is the only observer in a position to
   * check that the module actually loads.
   */
  async markAwaitingRestart(
    jobId: string,
    data: { appliedMigrations: string[]; releaseStamp: string | null }
  ): Promise<void> {
    await ModuleInstallJob.query()
      .where('id', jobId)
      .update({
        state: 'awaiting_restart',
        step: 'restart',
        applied_migrations: JSON.stringify(data.appliedMigrations),
        release_stamp: data.releaseStamp,
        heartbeat_at: DateTime.now().toSQL(),
      })
  }

  /**
   * Finish a job that needs no restart.
   *
   * Only reachable when the module was already loaded and ships no `ui/` — so
   * the running process can see it, its tables now exist, and it is enabled.
   * There is nothing left for a later boot to verify.
   */
  async markSucceeded(jobId: string, appliedMigrations: string[]): Promise<void> {
    await ModuleInstallJob.query()
      .where('id', jobId)
      .update({
        state: 'succeeded',
        step: null,
        active_lock: null,
        applied_migrations: JSON.stringify(appliedMigrations),
        finished_at: DateTime.now().toSQL(),
      })
  }

  async markFailed(
    jobId: string,
    error: { step: string; reason: string; message: string; logTail?: string }
  ): Promise<void> {
    await ModuleInstallJob.query().where('id', jobId).update({
      state: 'failed',
      step: error.step,
      active_lock: null,
      error_reason: error.reason,
      error_message: error.message,
      log_tail: error.logTail ?? null,
      finished_at: DateTime.now().toSQL(),
    })
  }

  // ── resume ────────────────────────────────────────────────────────────────

  /**
   * Decide the fate of an install that was interrupted by the restart it asked
   * for.
   *
   * Runs at boot, behind a lock so exactly one worker does it. This is where an
   * install actually becomes a success — and the bar is deliberately high: the
   * module must now resolve *and* be enabled. Anything less is reported as a
   * failure, because "we ran the steps" is not the same as "it works", and only
   * one of those is worth telling an operator.
   */
  async resumeOnBoot(): Promise<void> {
    await withAdvisoryLock(LOCK_KEYS.installResume, () => this.doResume(), { onBusy: 'skip' })
  }

  private async doResume(): Promise<void> {
    let job: ModuleInstallJob | null

    try {
      job = await this.active()
    } catch {
      /** Table not migrated yet. Nothing to resume by definition. */
      return
    }

    if (!job) return

    if (job.state === 'awaiting_restart') {
      await this.settleAwaitingRestart(job)
      return
    }

    /**
     * `queued` or `running`: the child either is still working or is gone.
     * Heartbeat rather than `process.kill(pid, 0)` — pids get reused, and in a
     * multi-machine deployment the pid means nothing to whoever is asking.
     */
    const beat = job.heartbeatAt ?? job.createdAt
    if (DateTime.now().diff(beat).toMillis() < HEARTBEAT_TIMEOUT_MS) return

    await ModuleInstallJob.query().where('id', job.id).update({
      state: 'abandoned',
      active_lock: null,
      error_reason: 'installer_vanished',
      error_message: 'The installer stopped reporting. It may have been killed or run out of memory.',
      finished_at: DateTime.now().toSQL(),
    })

    await new AuditLogService().record({
      actor: { type: 'system', label: 'installer' },
      action: 'module.install_abandoned',
      subjectType: 'module',
      subjectId: job.moduleName,
      requestId: job.requestId,
      changes: { jobId: job.id, step: job.step, logTail: job.logTail },
    })
  }

  private async settleAwaitingRestart(job: ModuleInstallJob): Promise<void> {
    /**
     * Are we the process that came back *after* the restart, or one that has
     * not cycled yet? For a build, the release we booted from must be the one
     * the installer produced. With no build there is no release to compare, so
     * simply being a process that started after the job did is enough — and the
     * verification below is what actually decides the outcome either way.
     */
    if (job.requiresBuild && job.releaseStamp && job.releaseStamp !== currentReleaseStamp()) {
      return
    }

    const { getModule } = await import('#modules/registry')
    const loaded = Boolean(getModule(job.moduleName))
    const row = await Module.findBy('name', job.moduleName)
    const enabled = Boolean(row?.enabled)

    if (!loaded || !enabled) {
      await ModuleInstallJob.query()
        .where('id', job.id)
        .update({
          state: 'failed',
          active_lock: null,
          error_reason: 'module_not_loadable_after_restart',
          error_message: !loaded
            ? `"${job.moduleName}" still does not load after the restart. Check the server log for why discovery refused it.`
            : `"${job.moduleName}" loaded but is not enabled.`,
          finished_at: DateTime.now().toSQL(),
        })
      return
    }

    await ModuleInstallJob.query().where('id', job.id).update({
      state: 'succeeded',
      step: null,
      active_lock: null,
      finished_at: DateTime.now().toSQL(),
    })

    await new AuditLogService().record({
      actor: { type: 'system', label: 'installer' },
      action: 'module.installed',
      subjectType: 'module',
      subjectId: job.moduleName,
      requestId: job.requestId,
      changes: { jobId: job.id, releaseStamp: job.releaseStamp },
    })
  }
}
