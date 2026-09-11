import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MODULES_DIR, manifestFileFor, scanModuleFolders } from '#modules/paths'
import type { ApplicationService, HttpRouterService } from '@adonisjs/core/types'
import semver from 'semver'
import { CMS_VERSION } from '#cms_version'
import type { NamedMiddleware, ModuleManifest, ModulePermission } from '#modules/types'

export { MODULES_DIR, scanModuleFolders } from '#modules/paths'

/**
 * The sentinel that turns safe mode on without touching the environment.
 *
 * `tmp/` sits next to `modules/`, so this is reachable over SSH by anyone who
 * can already read the code — which is the situation safe mode exists for.
 */
const SAFE_MODE_SENTINEL = fileURLToPath(new URL('../tmp/SAFE_MODE', import.meta.url))

/**
 * Boot with no modules at all.
 *
 * Two triggers because they are reachable in different emergencies:
 * `DRIFTLESS_SAFE_MODE=1` for whoever controls the supervisor config, and the
 * sentinel file for whoever only has a shell. The installer uses the file too —
 * it can drop it before a risky step and remove it after.
 *
 * Read once. A flag that could change under a running process would leave half
 * the request lifecycle believing one thing and half the other.
 */
export const SAFE_MODE =
  process.env.DRIFTLESS_SAFE_MODE === '1' || existsSync(SAFE_MODE_SENTINEL)

/**
 * Names excluded from discovery this boot — `DRIFTLESS_DISABLE_MODULES=a,b`.
 *
 * The surgical version of safe mode: keep the shop running while one bad
 * package is kept out.
 */
export const DISABLED_BY_ENV = new Set(
  (process.env.DRIFTLESS_DISABLE_MODULES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
)

/**
 * Find every module by looking, rather than by being told.
 *
 * This was a hand-written list of imports, which meant installing a module
 * required editing a core source file — something an installer unpacking a zip
 * cannot do, and the one reason "just drop in a folder" was not actually true.
 * Now a directory holding `module.ts` (dev) or `module.js` (build) is a module.
 *
 * Sorted, so the order is identical on every machine and every boot. Nothing
 * here should depend on that order; a stable one makes it obvious if something
 * starts to.
 */
async function discoverModules(): Promise<ModuleManifest[]> {
  /**
   * One early return, and everything else follows from it: no module routes get
   * registered, no `boot()` hooks run, no permissions are minted, no reserved
   * segments are claimed and no nav appears. Recovering an install that a
   * module has broken needs exactly that — core, and nothing else.
   */
  if (SAFE_MODE) {
    console.warn('[modules] SAFE MODE — no modules will be loaded.')
    return []
  }

  const entries = scanModuleFolders().filter((name) => !DISABLED_BY_ENV.has(name))

  const found: ModuleManifest[] = []

  for (const name of entries) {
    /**
     * Import the file we actually found, rather than the `#modules/*` alias.
     *
     * The alias always resolves against the real `modules/` directory, so it
     * silently ignored `DRIFTLESS_MODULES_DIR` — discovery would scan a fixture
     * directory and then import from somewhere else entirely. One mechanism for
     * both, and `.ts` in development goes through the same loader hook the
     * alias relied on.
     */
    const manifestFile = manifestFileFor(name)!

    try {
      const imported = (await import(
        pathToFileURL(join(MODULES_DIR, name, manifestFile)).href
      )) as { default?: ModuleManifest }
      const manifest = imported.default

      if (!manifest?.name) {
        console.error(`[modules] "${name}/module" has no default export; skipping.`)
        continue
      }

      /**
       * The folder name is what the database row, the routes and the enable
       * toggle all key on. A manifest claiming a different one would have the
       * toggle flip a row while the routes guard a different module entirely.
       */
      if (manifest.name !== name) {
        console.error(
          `[modules] "${name}/module" declares name "${manifest.name}" — folder and name must match. Skipping.`
        )
        continue
      }

      const refusal = refuse(manifest)
      if (refusal) {
        console.error(`[modules] "${name}" was not loaded: ${refusal}`)
        continue
      }

      found.push(manifest)
    } catch (error) {
      /**
       * One bad module must not take the application down with it.
       *
       * If a half-extracted or incompatible module threw here and boot stopped,
       * the operator would be locked out of the very screen they need in order
       * to disable it — a broken install with no way back. Skipping keeps
       * everything else running and leaves the failure in the logs.
       */
      console.error(`[modules] failed to load "${name}":`, error)
    }
  }

  return found
}

/**
 * Why a manifest may not be loaded, or `null` if it is fine.
 *
 * Refusing here rather than letting it load is the difference between a clear
 * line in the log and a failure that surfaces later looking like a bug in the
 * CMS itself.
 */
function refuse(manifest: ModuleManifest): string | null {
  const range = manifest.engines?.driftless
  if (range && !semver.satisfies(CMS_VERSION, range, { includePrerelease: true })) {
    return `it needs Driftless ${range}, this is ${CMS_VERSION}`
  }

  /**
   * The `kind: 'plugin'` contract, enforced in exactly one place.
   *
   * These three reach furthest outside a package: `boot` runs arbitrary code
   * against the live container, `reservedSegments` claims public URLs, and
   * `maintenance` runs on a schedule with nobody watching. An app may have
   * them; a third-party plugin may not. Without this check `kind` would be a
   * label rather than a boundary.
   */
  if (manifest.kind === 'plugin') {
    const forbidden = (
      [
        ['boot', manifest.boot],
        ['maintenance', manifest.maintenance],
        ['reservedSegments', manifest.reservedSegments],
      ] as const
    )
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field)

    if (forbidden.length > 0) {
      return `a plugin may not declare ${forbidden.join(', ')} — use kind: 'app'`
    }
  }

  return null
}

/**
 * Drop anything whose declared dependencies are not installed.
 *
 * A second pass, because a module can require one that sorts after it. Repeated
 * until nothing else falls out: removing a module can leave a *third* one
 * unsatisfied, and stopping after one round would load a package whose
 * dependency is not there.
 */
function pruneUnsatisfied(modules: ModuleManifest[]): ModuleManifest[] {
  let kept = modules

  for (;;) {
    const present = new Map(kept.map((m) => [m.name, m.version]))

    const survivors = kept.filter((manifest) => {
      for (const [dependency, range] of Object.entries(manifest.requires?.modules ?? {})) {
        const version = present.get(dependency)

        if (version === undefined) {
          console.error(`[modules] "${manifest.name}" was not loaded: it needs "${dependency}"`)
          return false
        }

        if (!semver.satisfies(version, range, { includePrerelease: true })) {
          console.error(
            `[modules] "${manifest.name}" was not loaded: it needs ${dependency} ${range}, found ${version}`
          )
          return false
        }
      }

      return true
    })

    if (survivors.length === kept.length) return survivors
    kept = survivors
  }
}

/**
 * Every module present on disk. Resolved once, when this file is first
 * imported — top-level await, so every consumer sees a complete list.
 */
export const MODULES: ModuleManifest[] = pruneUnsatisfied(await discoverModules())

export function getModule(name: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.name === name)
}

/** Called once at boot from `start/routes.ts`. Routes are guarded per-request. */
export function registerAllModuleRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  for (const mod of MODULES) {
    mod.registerRoutes(router, middleware)
  }
}

/**
 * First URL segments the installed modules claim on the public site.
 *
 * Read by the CMS catch-all so core never has to name a module to know that
 * `/shop/...` is spoken for.
 */
export function allReservedSegments(): string[] {
  return MODULES.flatMap((m) => m.reservedSegments ?? [])
}

/** All permissions declared by all modules (minted by the provider on boot). */
export function allModulePermissions(): ModulePermission[] {
  return MODULES.flatMap((m) => m.permissions)
}

/**
 * Modules whose `boot()` threw during this process's startup.
 *
 * Exported so the admin can say which ones, and so the provider can disable
 * them rather than let the same failure repeat on every restart.
 */
export const bootFailures = new Map<string, string>()

/**
 * Run each enabled module's optional boot hook, one failure at a time.
 *
 * Discovery already refuses to let a module's *import* take the application
 * down. `boot()` was the remaining hole and the more dangerous one, because it
 * runs a module's own code against a live container: a marketplace package that
 * imports cleanly and then throws on a missing table stopped the whole process,
 * locking the operator out of the one screen they need in order to remove it.
 *
 * A module that throws here is left in `bootFailures`; the provider disables it
 * so the next boot skips it entirely. Everything else still boots.
 */
export async function bootModules(app: ApplicationService, isEnabled: (name: string) => boolean) {
  bootFailures.clear()

  for (const mod of MODULES) {
    if (!mod.boot || !isEnabled(mod.name)) continue

    try {
      await mod.boot(app)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      bootFailures.set(mod.name, message)
      console.error(`[modules] "${mod.name}" failed to boot:`, error)
    }
  }
}
