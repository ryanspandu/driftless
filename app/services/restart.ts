import app from '@adonisjs/core/services/app'
import AuditLogService from '#services/audit_log_service'
import { isSupervised, restartHint, supervisorMode } from '#services/supervisor'

export interface RestartOutcome {
  restarted: boolean
  /** Only set when we refused: the command the operator must run instead. */
  hint?: string
}

/**
 * How long to keep answering after announcing we are going away.
 *
 * Long enough for a load balancer's next health check to see the 503 and stop
 * sending us traffic. Pointless under socket activation — nothing is watching,
 * and the kernel queue covers the gap — so it is skipped there rather than
 * charged to every visitor as pure delay.
 */
const PREDRAIN_MS = Number(process.env.DRIFTLESS_PREDRAIN_MS ?? 1000)

/**
 * Set once, and never unset. Read by the health endpoints so a proxy or the
 * other workers can shed this process before it stops accepting connections.
 */
let draining = false

export function isDraining(): boolean {
  return draining
}

/**
 * Restart this process, by exiting and letting the supervisor bring it back.
 *
 * The refusal in step one is the whole safety property. Exiting a process that
 * nothing will restart is not a restart, it is an outage with no operator
 * watching — so an unsupervised install stops here, reports what still needs
 * doing, and leaves the site running on the old code.
 */
export default async function requestRestart(reason: string): Promise<RestartOutcome> {
  if (!isSupervised()) {
    return { restarted: false, hint: restartHint() }
  }

  /**
   * Awaited, unlike every other audit write in this codebase.
   *
   * `AuditLogService.record` never throws and is normally fire-and-forget. Here
   * the process is about to stop existing, so anything not awaited simply never
   * happens — and this is the row that explains an unexplained restart to
   * whoever reads the log afterwards.
   */
  await new AuditLogService().record({
    actor: { type: 'system', label: 'restart' },
    action: 'module.restarting',
    changes: { reason, mode: supervisorMode(), pid: process.pid },
  })

  draining = true

  if (supervisorMode() !== 'systemd-socket' && PREDRAIN_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, PREDRAIN_MS))
  }

  /**
   * `terminate()` runs the `terminating` hooks — closing the queue's Redis
   * socket, draining HTTP — and `bin/server.ts` arms a deadline in case one of
   * them does not come back.
   */
  await app.terminate()

  return { restarted: true }
}
