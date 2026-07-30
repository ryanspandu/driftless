import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Clears `build/` and `public/assets/` before a build. Runs as `prebuild`.
 *
 * Both deletions are load-bearing, and the second one is the surprising one.
 *
 * `adonisrc.ts` lists `public/**` as a meta file, so the bundler copies it into
 * `build/public/` — *after* Vite has written the fresh bundle there. Since
 * `postbuild` syncs `build/public/assets` back into `public/assets` without
 * clearing it, every build left the previous build's chunks behind and the next
 * one copied them forward. The directory only ever grew: 303 files where the
 * manifest referenced 165.
 *
 * Stale chunks alone would just be waste. The real damage is that the meta-file
 * copy is an unconditional `copyFile`, so a leftover
 * `public/assets/.vite/manifest.json` **overwrites the freshly generated one**.
 * The app then boots perfectly and serves the *previous* build's JavaScript,
 * with nothing anywhere reporting a problem.
 *
 * `scripts/verify-build.mjs` asserts the result; this prevents it.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

for (const target of ['build', 'public/assets']) {
  rmSync(join(root, target), { recursive: true, force: true })
}

console.log('[clean-build] removed build/ and public/assets/')
