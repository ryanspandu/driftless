import { DateTime } from 'luxon'
import ModuleInstallJob from '#models/module_install_job'
import requestRestart from '#services/restart'
import { releaseHasMoved } from '#services/release'
import { autoRestartEnabled, isSupervised } from '#services/supervisor'

/**
 * Notices when this process is serving code it should no longer be serving, and
 * restarts it.
 *
 * Two things can put a process in that state and neither announces itself:
 *
 *  - **The release moved.** `npm run release` — from a terminal or from an
 *    installer — swaps the `current` symlink and finishes. Today the docs just
 *    say "restart the process afterwards", and if nobody does, the site keeps
 *    answering with the previous build indefinitely. That is a live bug this
 *    closes, not only a new feature.
 *  - **A module was installed with no UI.** No `ui/` means no rebuild, so the
 *    release does not move — but the running process resolved `MODULES` at
 *    import and cannot see the new folder, so it still needs to cycle.
 */

/** Base interval. Short enough that an install feels finished, long enough to be free. */
const INTERVAL_MS = 10_000

/**
 * Jitter, and it is doing real work.
 *
 * With several workers, each notices the same condition at a slightly different
 * moment and leaves at a slightly different moment — which is a rolling restart
 * with no orchestration, no leader election and no extra state. Seeded from the
 * instance number where there is one, so the spread is deterministic rather than
 * occasionally clumping.
 */
const JITTER_MS = 3_000

let timer: NodeJS.Timeout | null = null
let restarting = false

function jitter(): number {
  const instance = Number(process.env.NODE_APP_INSTANCE)
  if (Number.isFinite(instance)) {
    /** Spread instances evenly across the jitter window. */
    return ((instance % 5) / 5) * JITTER_MS * 2 - JITTER_MS
  }
  return (process.pid % 1000) / 1000 * JITTER_MS * 2 - JITTER_MS
}

/**
 * Whether an install has finished its work and is waiting for us to cycle.
 *
 * Scoped to jobs requested *after* this process booted, so a job we have
 * already restarted into does not keep re-triggering.
 */
async function restartIsOwed(bootedAt: DateTime): Promise<boolean> {
  try {
    const job = await ModuleInstallJob.query()
      .where('state', 'awaiting_restart')
      .where('requires_restart', true)
      .whereNotNull('active_lock')
      .first()

    if (!job) return false

    return (job.startedAt ?? job.createdAt) > bootedAt
  } catch {
    /**
     * The table may not exist yet on a database that has not been migrated.
     * A watcher that throws on a timer would produce an unhandled rejection
     * every ten seconds; the release check still works without this one.
     */
    return false
  }
}

export function startRestartWatcher(): void {
  if (timer) return

  /**
   * Only where a restart is actually a restart. Unsupervised, exiting is just
   * the site going down — and in development a moved release is meaningless.
   */
  if (!isSupervised() || !autoRestartEnabled()) return

  const bootedAt = DateTime.now()

  timer = setInterval(
    () => {
      void tick(bootedAt)
    },
    INTERVAL_MS + jitter()
  )

  /** Never let the watcher be the reason the process stays alive. */
  timer.unref()
}

export function stopRestartWatcher(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

async function tick(bootedAt: DateTime): Promise<void> {
  if (restarting) return

  try {
    const reason = releaseHasMoved()
      ? 'release_changed'
      : (await restartIsOwed(bootedAt))
        ? 'module_installed'
        : null

    if (!reason) return

    restarting = true
    stopRestartWatcher()

    console.log(`[restart] ${reason} — cycling this process`)
    await requestRestart(reason)
  } catch (error) {
    /**
     * A failed restart must not take the process with it: it is still serving,
     * just with the wrong code. Reset and let the next tick try again.
     */
    restarting = false
    console.error('[restart] watcher failed', (error as Error).message)
  }
}
