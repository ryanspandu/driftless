import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireBuildLock } from './build-lock.mjs'

/**
 * Builds a release and swaps it in without taking the site down.
 *
 *   node scripts/build-release.mjs [--keep=3]
 *
 * ## Why this exists rather than `npm run build`
 *
 * `node ace build` does `rm -rf build/` unconditionally, and production
 * lazy-imports its controllers (`() => import('#controllers/...')`) out of that
 * tree. Building in place therefore breaks every route that has not been loaded
 * yet, for the whole multi-minute build, and a build that *fails* leaves the
 * site broken permanently. Once installing an app from the marketplace triggers
 * a rebuild, that stops being a rare deploy-day risk and becomes routine.
 *
 * ## The layout
 *
 *   releases/<timestamp>/   a complete, verified build
 *   current -> releases/…   a symlink; swapping it is one atomic rename
 *   shared/                 everything that must outlive a release
 *     .env  storage/  uploads/  tmp/
 *
 * **`shared/` is the important half.** `storage/protected/` holds digital
 * products customers have paid for and `uploads/` holds their media library —
 * both lived inside the build tree, which meant every rebuild deleted them. No
 * application code needed changing to fix that: each release symlinks those
 * paths back out to `shared/`, so `app.publicPath('uploads')` resolves through
 * the link and writes land somewhere a build cannot reach.
 *
 * Nothing is destroyed on failure: the new release is built to its own
 * directory and `current` only moves once the build has passed verification.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releasesDir = join(root, 'releases')
const sharedDir = join(root, 'shared')
const currentLink = join(root, 'current')

const keep = Number(process.argv.find((a) => a.startsWith('--keep='))?.split('=')[1] ?? 3)

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' })
}

function log(message) {
  console.log(`[release] ${message}`)
}

// ── single-flight ───────────────────────────────────────────────────────────
try {
  acquireBuildLock({
    onStaleTakeover: (pid) => log(`taking over a stale lock from pid ${pid || 'unknown'}`),
  })
} catch (error) {
  console.error(`[release] ${error.message}`)
  process.exit(1)
}

/**
 * Link `target` into a release, replacing whatever is there.
 *
 * Relative link targets on purpose: the whole tree can be moved or bind-mounted
 * somewhere else and the links still resolve.
 */
function link(from, to) {
  mkdirSync(dirname(from), { recursive: true })
  rmSync(from, { recursive: true, force: true })
  symlinkSync(relative(dirname(from), to), from)
}

// ── shared state ────────────────────────────────────────────────────────────
/**
 * Only the top-level shared directories. Pre-creating anything deeper is what
 * made the first version of this script destroy data: `adopt()` skipped moving
 * `storage/protected` because the destination already existed, and then deleted
 * the source anyway.
 */
mkdirSync(sharedDir, { recursive: true })
mkdirSync(join(sharedDir, 'tmp'), { recursive: true })

/**
 * Adopt whatever the source tree already holds, then point the source tree at
 * `shared/` too.
 *
 * The second half is not optional. Moving the data out and leaving `storage/`
 * a real directory would give development its own empty copy while the live
 * releases used another — the operator's media and paid downloads would appear
 * to vanish. One dataset, reached the same way from every release and from the
 * source checkout.
 */
function adopt(livePath, sharedPath) {
  if (lstatSafe(livePath)?.isSymbolicLink()) return

  if (existsSync(livePath)) {
    mergeInto(livePath, sharedPath)

    /**
     * **Only ever remove an empty directory.** Anything still here was not
     * moved, and deleting it would be exactly the data loss this whole layout
     * exists to prevent. `rmdirSync` throws on a non-empty directory, which is
     * the behaviour we want — a loud failure beats a silent deletion.
     */
    try {
      rmdirSync(livePath)
    } catch {
      console.error(
        `[release] ${relative(root, livePath)} still holds files that were not adopted — ` +
          `move them into shared/ by hand, then run this again. Nothing was deleted.`
      )
      process.exit(1)
    }
  }

  link(livePath, sharedPath)
}

/**
 * Move `from` into `to`, merging directories instead of skipping them.
 *
 * A file already present at the destination is left alone *and* left at the
 * source, so the caller's empty-directory check refuses to delete it.
 */
function mergeInto(from, to) {
  mkdirSync(to, { recursive: true })

  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const destination = join(to, entry.name)

    if (!existsSync(destination)) {
      renameSync(source, destination)
      log(`adopted ${relative(root, source)} into shared/`)
      continue
    }

    if (entry.isDirectory() && lstatSafe(destination)?.isDirectory()) {
      mergeInto(source, destination)
      try {
        rmdirSync(source)
      } catch {
        /* left in place on purpose — the caller reports it */
      }
    }
  }
}

function lstatSafe(path) {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

adopt(join(root, 'storage'), join(sharedDir, 'storage'))
adopt(join(root, 'public/uploads'), join(sharedDir, 'uploads'))

if (!lstatSafe(join(root, '.env'))?.isSymbolicLink() && existsSync(join(root, '.env'))) {
  if (!existsSync(join(sharedDir, '.env'))) {
    renameSync(join(root, '.env'), join(sharedDir, '.env'))
    log('adopted .env into shared/')
  } else {
    rmSync(join(root, '.env'), { force: true })
  }
  link(join(root, '.env'), join(sharedDir, '.env'))
}

// ── build ───────────────────────────────────────────────────────────────────
log('building…')
run('npm', ['run', 'build'])

log('verifying the build…')
run('node', ['scripts/verify-build.mjs'])

// ── stage the release ───────────────────────────────────────────────────────
mkdirSync(releasesDir, { recursive: true })

/**
 * The build lock already makes a collision impossible — two runs cannot both be
 * here at once, and the stamp has millisecond resolution. This is the belt to
 * that pair of braces: `renameSync` onto an existing release directory would
 * merge the two silently rather than fail, and the cost of being wrong is a
 * release with files from two different builds in it.
 */
let stamp = new Date().toISOString().replace(/[:.]/g, '-')
for (let n = 2; existsSync(join(releasesDir, stamp)); n++) {
  stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${n}`
}

const release = join(releasesDir, stamp)
renameSync(join(root, 'build'), release)

/**
 * `build/package.json` is a byte-identical copy of the source one, so the
 * dependency tree is the same and a single install can serve every release.
 */
link(join(release, 'node_modules'), join(root, 'node_modules'))
link(join(release, '.env'), join(sharedDir, '.env'))
link(join(release, 'storage'), join(sharedDir, 'storage'))
link(join(release, 'tmp'), join(sharedDir, 'tmp'))
link(join(release, 'public/uploads'), join(sharedDir, 'uploads'))

/**
 * `node ace build` does not copy `scripts/`, so `prestart` had nothing to run —
 * the documented `cd build && npm start` never actually worked.
 */
link(join(release, 'scripts'), join(root, 'scripts'))

// ── swap ────────────────────────────────────────────────────────────────────
const staging = `${currentLink}.next`
rmSync(staging, { force: true })
symlinkSync(relative(root, release), staging)

/**
 * One `rename` over the old symlink. This is the only moment the live release
 * changes, and it is atomic — there is no instant where `current` is missing.
 * A process already running keeps its own files open until it restarts.
 */
renameSync(staging, currentLink)
log(`current -> releases/${stamp}`)

// ── prune ───────────────────────────────────────────────────────────────────
/**
 * Never prune a release that is still young enough to be serving.
 *
 * Production lazy-imports its controllers out of the release tree, so a worker
 * that has not yet been hit on some route still needs its files on disk. Delete
 * the directory out from under it and that route answers `ENOENT` forever —
 * and a rolling restart deliberately keeps old workers alive for a while, which
 * widens the window rather than closing it.
 */
const PRUNE_GRACE_MS = 15 * 60 * 1000
const now = Date.now()

const olds = readdirSync(releasesDir)
  .filter((name) => name !== stamp)
  .sort()
  .reverse()
  .slice(keep - 1)

for (const old of olds) {
  const path = join(releasesDir, old)
  const age = now - (statSafe(path)?.mtimeMs ?? 0)

  if (age < PRUNE_GRACE_MS) {
    log(`kept releases/${old} — too recent to be certain nothing is still serving it`)
    continue
  }

  rmSync(path, { recursive: true, force: true })
  log(`pruned releases/${old}`)
}

function statSafe(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

log('done — restart the app to serve it')
