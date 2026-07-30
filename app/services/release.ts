import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, join } from 'node:path'
import app from '@adonisjs/core/services/app'

/**
 * Which build of the application this process is running.
 *
 * Two things need it and neither can be answered by the version number: the
 * restart watcher, which has to notice that `current` now points somewhere else,
 * and the page snapshot cache, which has to know whether stored HTML references
 * asset hashes from a build that still exists.
 */

/**
 * The release directory this process booted from, resolved through the symlink
 * once at import.
 *
 * Resolved eagerly and cached on purpose: the whole point is to compare it
 * against what `current` points at *now*, so re-reading it later would compare
 * a value with itself and never detect anything.
 */
const bootedRelease: string | null = (() => {
  try {
    /**
     * `app.appRoot` is the release directory in production, because that is
     * where `bin/server.js` lives. Outside the release layout it is the
     * checkout, and `realpath` simply returns it unchanged.
     */
    return realpathSync(app.appRoot.pathname)
  } catch {
    return null
  }
})()

/** Where `current` points right now, or null outside the release layout. */
export function currentReleasePath(): string | null {
  /**
   * From inside a release, `current` is a sibling of the `releases/` directory
   * that contains us — i.e. two levels up. Checking `existsSync` rather than
   * assuming keeps this harmless in development, where neither exists.
   */
  const link = bootedRelease ? join(bootedRelease, '..', '..', 'current') : null
  if (!link || !existsSync(link)) return null

  try {
    return realpathSync(link)
  } catch {
    return null
  }
}

/**
 * Whether a new release has been swapped in under this process.
 *
 * True means we are serving code that is no longer the current one — every
 * lazily-imported controller we have not touched yet will come from the old
 * tree, and the assets on disk belong to somebody else's build.
 */
export function releaseHasMoved(): boolean {
  const current = currentReleasePath()
  return current !== null && bootedRelease !== null && current !== bootedRelease
}

/** The stamp of the release now live, for recording on an install job. */
export function currentReleaseStamp(): string | null {
  const current = currentReleasePath()
  return current ? basename(current) : null
}

/**
 * A stable identifier for the build whose assets are on disk.
 *
 * Under the release layout this is the release stamp. Outside it — development,
 * CI, a plain `npm run build` — it falls back to a hash of the Vite manifest,
 * which changes exactly when the asset hashes do. Null when there is no built
 * manifest at all, which is the normal state under the dev server.
 */
let buildId: string | null | undefined

export function currentBuildId(): string | null {
  if (buildId !== undefined) return buildId

  const stamp = currentReleaseStamp()
  if (stamp) {
    buildId = stamp
    return buildId
  }

  const manifestPath = app.makePath('public/assets/.vite/manifest.json')
  if (!existsSync(manifestPath)) {
    buildId = null
    return buildId
  }

  try {
    buildId = createHash('sha256').update(readFileSync(manifestPath)).digest('hex').slice(0, 16)
  } catch {
    buildId = null
  }

  return buildId
}
