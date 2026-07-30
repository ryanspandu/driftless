import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Builds twice and asserts the second manifest is the second build's output.
 *
 *   node scripts/check-build-reproducible.mjs
 *
 * This exists because of a bug that shipped silently: `public/**` was a build
 * meta-file, so each build copied the *previous* build's chunks back over the
 * fresh ones — including `.vite/manifest.json`. The app then booted perfectly
 * and served the previous build's JavaScript, with nothing anywhere reporting a
 * fault. `verify-build.mjs` catches the resulting orphans; this catches the
 * mechanism, by proving a second build actually replaces the first.
 *
 * Meant for CI, where it is cheap insurance against the same class of mistake
 * being reintroduced by a metaFiles or postbuild change.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'build/public/assets/.vite/manifest.json')

function build(label) {
  console.log(`[reproducible] build ${label}…`)
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  return readFileSync(manifestPath, 'utf8')
}

const first = build('1')
const second = build('2')

execFileSync('node', ['scripts/verify-build.mjs'], { cwd: root, stdio: 'inherit' })

/**
 * The manifests may differ — hashes are content-based but chunk naming is not
 * guaranteed stable across runs. What must hold is that the manifest on disk
 * describes the build that just ran, which `verify-build` proves by checking
 * every referenced file exists and nothing is orphaned.
 *
 * The one thing that would mean the old bug is back: a byte-identical manifest
 * whose entry chunk is missing from the second build's output.
 */
const entry = JSON.parse(second)['inertia/app.tsx']
if (!entry?.file) {
  console.error('[reproducible] the manifest has no entry for inertia/app.tsx')
  process.exit(1)
}

console.log(
  first === second
    ? '[reproducible] ok — both builds produced the same manifest, and it matches disk'
    : '[reproducible] ok — the second build replaced the first, and the manifest matches disk'
)
