import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where modules live, and what is in there — with **no side effects**.
 *
 * Split out of `registry.ts` because importing that file runs discovery: it
 * imports every manifest at module scope. Two callers must be able to ask
 * "which folders are there" without that happening — `modules:list`, whose
 * entire purpose is to answer when a module is preventing startup, and the
 * installer, which needs to see a folder the running process has not imported
 * and never will.
 */

/**
 * The modules directory — this file's own folder, in dev and in `build/` alike.
 *
 * Taken from `import.meta.url` rather than the application service because
 * discovery runs while `registry.ts` is still being evaluated, before anything
 * has had a chance to hand us a container.
 *
 * `DRIFTLESS_MODULES_DIR` overrides it. Without that override there is no way
 * to exercise installation without writing into the real `modules/` — the one
 * directory a test must never touch.
 */
export const MODULES_DIR =
  process.env.DRIFTLESS_MODULES_DIR ?? fileURLToPath(new URL('.', import.meta.url))

/** The manifest filename, in build (`.js`) and dev (`.ts`) order. */
const MANIFEST_FILES = ['module.js', 'module.ts']

export function manifestFileFor(name: string): string | undefined {
  return MANIFEST_FILES.find((file) => existsSync(join(MODULES_DIR, name, file)))
}

/**
 * Every folder on disk that looks like a module, whether or not it loaded.
 *
 * Distinct from `MODULES` on purpose, and both are needed. `MODULES` is what
 * this process imported at startup; this is what is *there now*. A folder
 * dropped in after boot appears here and cannot appear there — which is exactly
 * the case the installer exists to handle.
 *
 * It is also the allow-list the installer resolves a requested name through.
 * Because every value comes back from `readdirSync`, a directory entry name,
 * path traversal is structurally impossible: `../` cannot be one.
 */
export function scanModuleFolders(): string[] {
  try {
    return readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.') && !name.startsWith('_'))
      .filter((name) => manifestFileFor(name) !== undefined)
      .sort()
  } catch {
    return []
  }
}
