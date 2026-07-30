import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Asserts that a built asset directory and its Vite manifest agree.
 *
 *   node scripts/verify-build.mjs [assetDir]
 *
 * Two directions, and both have bitten this project:
 *
 * - **Every manifest entry exists on disk.** A manifest pointing at a chunk
 *   that was never written means a blank page for whoever loads it.
 * - **Every file on disk is referenced by the manifest.** Orphans are the
 *   signature of the stale-copy bug `scripts/clean-build.mjs` prevents, and
 *   they matter because the *reason* they survive is that an old manifest was
 *   copied over the new one — at which point the app silently serves the
 *   previous build.
 *
 * Written to be used twice: as a CI assertion, and as the gate the marketplace
 * installer runs before it swaps a freshly built release into place. An
 * installer that cannot tell a good build from a corrupt one will eventually
 * publish a corrupt one.
 *
 * Exits non-zero and names the files on failure.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assetDir = process.argv[2] ? join(root, process.argv[2]) : join(root, 'build/public/assets')
const manifestPath = join(assetDir, '.vite/manifest.json')

function fail(message, files = []) {
  console.error(`[verify-build] ${message}`)
  for (const file of files.slice(0, 20)) console.error(`  - ${file}`)
  if (files.length > 20) console.error(`  … and ${files.length - 20} more`)
  process.exit(1)
}

if (!existsSync(manifestPath)) fail(`no manifest at ${manifestPath} — was the build run?`)

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  fail(`manifest is not valid JSON: ${error.message}`)
}

/**
 * An entry contributes its own `file` plus any `css` and `assets` it names.
 * Missing any of those categories would report perfectly good stylesheets as
 * orphans.
 */
const referenced = new Set()
for (const entry of Object.values(manifest)) {
  if (entry.file) referenced.add(entry.file)
  for (const css of entry.css ?? []) referenced.add(css)
  for (const asset of entry.assets ?? []) referenced.add(asset)
}

if (referenced.size === 0) fail('manifest references nothing — it is empty or the wrong shape')

/** Everything Vite emitted, relative to the asset root. `.vite/` is its own bookkeeping. */
function walk(dir, prefix = '') {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.vite') continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel))
    else out.push(rel)
  }
  return out
}

/**
 * Emitted by a plugin rather than by Vite's own chunking, so it is legitimately
 * absent from the manifest and must not be read as a stale chunk.
 *
 * Only the service worker qualifies today. Serwist writes it from `swDest` in
 * `vite.config.ts`, which resolves relative to Vite's `outDir` and therefore
 * lands at `<assets>/public/sw.js` — note that this is *not* `build/public/sw.js`,
 * so nothing currently serves it at `/sw.js`. That is a real misconfiguration,
 * but an inert one while `DISABLE_OFFLINE=1`, and fixing it is not this script's
 * job. Keep the entry narrow: a broad allowlist here would hide exactly the
 * corruption this script exists to catch.
 */
const NOT_IN_MANIFEST = new Set(['public/sw.js', 'public/sw.js.map'])

const onDisk = walk(assetDir).filter((file) => !NOT_IN_MANIFEST.has(file))

const missing = [...referenced].filter((file) => !onDisk.includes(file))
if (missing.length > 0) {
  fail(`${missing.length} manifest entries have no file on disk:`, missing)
}

const orphans = onDisk.filter((file) => !referenced.has(file))
if (orphans.length > 0) {
  fail(
    `${orphans.length} files on disk are not referenced by the manifest — the manifest is probably stale, meaning the app would serve a previous build:`,
    orphans
  )
}

console.log(`[verify-build] ok — ${referenced.size} files, manifest and disk agree`)
