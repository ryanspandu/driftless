import { existsSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Point `current` back at the previous release.
 *
 *   node scripts/rollback-release.mjs
 *
 * The counterpart to `build-release.mjs`, and the reason releases are kept
 * rather than overwritten: when a release turns out to be broken *after* it is
 * live, the fix has to be one command and a restart — not a rebuild, because
 * whatever broke may well break the build too.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releasesDir = join(root, 'releases')
const currentLink = join(root, 'current')

if (!existsSync(currentLink)) {
  console.error('[rollback] no `current` release to roll back from.')
  process.exit(1)
}

const live = basename(readlinkSync(currentLink))

const candidates = readdirSync(releasesDir)
  .filter((name) => name !== live)
  .sort()
  .reverse()

const target = candidates[0]

if (!target) {
  console.error('[rollback] only one release exists — nothing to roll back to.')
  process.exit(1)
}

const staging = `${currentLink}.next`
rmSync(staging, { force: true })
symlinkSync(relative(root, join(releasesDir, target)), staging)
renameSync(staging, currentLink)

console.log(`[rollback] current -> releases/${target} (was ${live})`)
console.log('[rollback] restart the app to serve it')
