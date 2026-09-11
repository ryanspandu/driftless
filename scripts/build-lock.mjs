import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One build at a time, across every process on this machine.
 *
 * The resource being protected is the filesystem — `build/`, `releases/`, and
 * the `current` symlink — and it is contended by three unrelated callers: the
 * admin installer, an operator running `npm run release`, and CI. Two at once
 * interleave one run's `rm -rf build/` with the other's compile and produce a
 * release that verifies fine and is missing half its chunks.
 *
 * A lock **directory** rather than a lock file: `mkdir` is atomic and fails with
 * `EEXIST` in a single syscall, with no read-then-write window to lose.
 *
 * On disk rather than in the database, for two reasons. It still works during an
 * install that has taken the database down, and it costs no long-lived
 * transaction — an idle-in-transaction connection held for the length of a
 * multi-minute build is killed outright by some poolers.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export const LOCK_DIR = join(root, 'tmp', 'build.lock')

function readPid() {
  try {
    return Number(readFileSync(join(LOCK_DIR, 'pid'), 'utf8').trim())
  } catch {
    return 0
  }
}

function isAlive(pid) {
  if (!pid) return false
  try {
    /** Signal 0 checks for existence without sending anything. */
    process.kill(pid, 0)
    return true
  } catch (error) {
    /** EPERM means it exists and belongs to someone else — still alive. */
    return error.code === 'EPERM'
  }
}

export class BuildLockedError extends Error {
  constructor(pid) {
    super(
      `another build is already running (pid ${pid || 'unknown'}). ` +
        `If you are sure it is not, remove tmp/build.lock and try again.`
    )
    this.name = 'BuildLockedError'
    this.pid = pid
  }
}

/**
 * Take the lock, or throw `BuildLockedError`.
 *
 * A lock whose holder is gone is taken over rather than respected: a build
 * killed by the OOM killer — the most likely ending on a small VPS — would
 * otherwise block every future build until someone deleted the directory by
 * hand.
 */
export function acquireBuildLock({ onStaleTakeover } = {}) {
  mkdirSync(join(root, 'tmp'), { recursive: true })

  try {
    mkdirSync(LOCK_DIR)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error

    const owner = readPid()
    if (isAlive(owner)) throw new BuildLockedError(owner)

    onStaleTakeover?.(owner)
    rmSync(LOCK_DIR, { recursive: true, force: true })
    mkdirSync(LOCK_DIR)
  }

  writeFileSync(join(LOCK_DIR, 'pid'), String(process.pid))

  let released = false
  const release = () => {
    if (released) return
    released = true
    rmSync(LOCK_DIR, { recursive: true, force: true })
  }

  process.on('exit', release)
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      release()
      process.exit(1)
    })
  }

  return release
}
