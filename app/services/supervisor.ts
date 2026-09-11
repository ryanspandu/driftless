import cluster from 'node:cluster'
import app from '@adonisjs/core/services/app'
import { isSocketActivated } from '#services/socket_activation'

export type Supervisor = 'pm2' | 'systemd' | 'container' | 'declared' | null

/**
 * How this process is being run, at the resolution the restart story needs.
 *
 * `detectSupervisor()` answers "will something restart me". That is enough to
 * decide whether exiting is safe, and not nearly enough to tell an operator what
 * their visitors will experience — a socket-activated unit and a bare fork are
 * both "systemd", and they behave completely differently.
 */
export type SupervisorMode =
  | 'systemd-socket'
  | 'pm2-cluster'
  | 'pm2-fork'
  | 'systemd'
  | 'container'
  | 'declared'
  | 'none'

/** Everything mode detection reads, so a test can supply it without a process. */
export interface SupervisorInputs {
  env: NodeJS.ProcessEnv
  pid: number
  managedByPm2: boolean
  isClusterWorker: boolean
  socketActivated: boolean
}

/**
 * Milliseconds from process start to `app.ready()`, recorded by `bin/server.ts`.
 *
 * Null until boot completes, and in any process that never boots an HTTP server
 * (ace commands, the queue worker). Callers must treat null as "unknown" rather
 * than substituting a guess — the entire point of measuring is to stop the UI
 * from making up numbers.
 */
let bootMs: number | null = null

export function markBootComplete(ms: number): void {
  bootMs = ms
}

export function bootDurationMs(): number | null {
  return bootMs
}

/**
 * Pure mode detection. Order matters twice over.
 *
 * A socket-activated unit also sets `INVOCATION_ID`, so it must be checked
 * first or it degrades to plain `systemd`. And the PM2 checks come before the
 * container check because PM2 inside a container is common and the PM2 answer is
 * the more specific one.
 */
export function detectSupervisorMode(inputs: SupervisorInputs): SupervisorMode {
  if (inputs.socketActivated) return 'systemd-socket'

  /**
   * `cluster.isWorker` rather than PM2's `exec_mode` or `NODE_APP_INSTANCE`:
   * PM2's cluster mode goes through Node's own `cluster.fork()`, so this is a
   * fact about the runtime rather than a detail of PM2's implementation.
   * `NODE_APP_INSTANCE` is set in *both* modes and discriminates nothing.
   */
  if (inputs.managedByPm2) return inputs.isClusterWorker ? 'pm2-cluster' : 'pm2-fork'

  if (inputs.env.INVOCATION_ID) return 'systemd'
  if (inputs.pid === 1) return 'container'
  if (inputs.env.DRIFTLESS_SUPERVISED === '1') return 'declared'

  return 'none'
}

function currentInputs(): SupervisorInputs {
  return {
    env: process.env,
    pid: process.pid,
    managedByPm2: app.managedByPm2,
    isClusterWorker: cluster.isWorker,
    socketActivated: isSocketActivated(),
  }
}

export function supervisorMode(): SupervisorMode {
  return detectSupervisorMode(currentInputs())
}

/**
 * How many web processes are serving, when that is knowable.
 *
 * PM2 exposes its configured instance count to each worker. Null whenever we
 * cannot prove a number — and the caller must degrade its claim rather than
 * assume, because "your site stays online" is only true with a second worker to
 * stay online *on*.
 */
export function workerCount(): number | null {
  if (supervisorMode() !== 'pm2-cluster') return null

  const raw = Number(process.env.instances)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

/**
 * Whether something will restart this process if it exits.
 *
 * Installing an app that ships UI ends in a restart, and the *only* safe way to
 * trigger one is to exit and let a supervisor bring the process back. Spawning
 * a replacement ourselves loses the port-bind race, inherits stdio badly,
 * leaves orphans, and — the part that matters — has nothing to fall back on if
 * the replacement fails to start. On a self-hosted box that is a dead site with
 * no operator watching.
 *
 * So the rule this exists to enforce is blunt: **never exit a process nobody
 * will restart.** Unsupervised, the installer stops at `awaiting_restart` and
 * shows the operator the command to run instead.
 */
export function detectSupervisor(): Supervisor {
  switch (supervisorMode()) {
    case 'pm2-cluster':
    case 'pm2-fork':
      return 'pm2'
    case 'systemd-socket':
    case 'systemd':
      return 'systemd'
    case 'container':
      return 'container'
    case 'declared':
      return 'declared'
    default:
      return null
  }
}

export function isSupervised(): boolean {
  return detectSupervisor() !== null
}

/**
 * How an operator restarts this particular installation, in words they can act
 * on.
 *
 * Shown when the process is not supervised, so "restart Driftless" never has to
 * be guessed at.
 */
export function restartHint(): string {
  switch (detectSupervisor()) {
    case 'pm2':
      return 'pm2 restart driftless'
    case 'systemd':
      return 'sudo systemctl restart driftless'
    case 'container':
      return 'restart the container'
    default:
      return 'stop the process and start it again with `npm start`'
  }
}

/**
 * What a restart will do to visitors, as a value the UI maps to copy.
 *
 * Every degradation here points the same way — toward the weaker, safer claim.
 * A cluster whose worker count we cannot prove is reported as `gap`, not
 * `rolling`: promising continuity we cannot verify is the one failure mode worth
 * engineering against, because the operator only finds out we were wrong by
 * watching their site go down.
 */
export type RestartKind = 'queued' | 'rolling' | 'gap' | 'manual'

export function restartKind(): RestartKind {
  const mode = supervisorMode()

  if (mode === 'none') return 'manual'
  if (mode === 'systemd-socket') return 'queued'

  const workers = workerCount()
  if (mode === 'pm2-cluster' && workers !== null && workers >= 2) return 'rolling'

  return 'gap'
}

/** The whole picture, for `GET /api/admin/deployment`. */
export interface DeploymentInfo {
  mode: SupervisorMode
  supervisor: Supervisor
  supervised: boolean
  restartKind: RestartKind
  workers: number | null
  bootMs: number | null
  restartHint: string
  autoRestart: boolean
}

export function deploymentInfo(): DeploymentInfo {
  return {
    mode: supervisorMode(),
    supervisor: detectSupervisor(),
    supervised: isSupervised(),
    restartKind: restartKind(),
    workers: workerCount(),
    bootMs: bootDurationMs(),
    restartHint: restartHint(),
    autoRestart: autoRestartEnabled(),
  }
}

/**
 * Auto-restart defaults on when supervised.
 *
 * The alternative default — serve stale code until somebody remembers to
 * restart — is the behaviour that exists today, and it fails silently: the
 * release is swapped, the site keeps answering, and it answers with the previous
 * build for as long as nobody notices.
 */
export function autoRestartEnabled(): boolean {
  return process.env.DRIFTLESS_AUTO_RESTART !== '0'
}
