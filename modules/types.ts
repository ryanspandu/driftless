import type { ApplicationService, HttpRouterService } from '@adonisjs/core/types'
import type { middleware } from '#start/kernel'

/** The app's named-middleware collection (includes `moduleEnabled`). */
export type NamedMiddleware = typeof middleware

export interface ModulePermission {
  name: string
  description: string
}

export interface ModuleNavItem {
  label: string
  href: string
  /** phosphor icon name, resolved on the client (optional for sub-items). */
  icon?: string
  /** Hide this item unless the current user holds this permission. */
  permission?: string
}

export interface ModuleNav {
  label: string
  /** phosphor icon name, resolved on the client (see phosphor-icon resolver). */
  icon: string
  /** Sidebar ordering within the "Apps" section (lower = higher). */
  order?: number
  /** Flat single-entry module: link target (used when `items` is absent). */
  href?: string
  /** Collapsible parent with sub-items. */
  items?: ModuleNavItem[]
  /** Hide the whole group unless the current user holds this permission. */
  permission?: string
}

/**
 * A module lives in `modules/<name>/` and co-locates its back-end (routes,
 * controllers, services, models, migrations) with its front-end (`ui/`). Unlike
 * A module is a self-contained package under `modules/<name>/`: it gets a
 * first-class sidebar entry, may freely import core (`~/components`,
 * `#services`, …), and is toggled at runtime from Settings. Core code must
 * never import a module by name — it discovers them by shape.
 */
export interface ModuleManifest {
  /** Unique key, equals the folder name under `modules/`. */
  name: string
  /**
   * The trust tier this package belongs to.
   *
   * `app` is first-party or vetted code with the full surface below. `plugin`
   * is the smaller contract offered to third parties — the installer refuses a
   * `plugin` manifest that declares `boot`, `maintenance` or
   * `reservedSegments`, since those reach furthest outside the package.
   *
   * A field rather than a second folder and a second implementation: the two
   * used to be separate systems that were 85% identical, and the copy that saw
   * less traffic drifted — its enabled-cache had no TTL and was simply wrong on
   * a multi-worker deployment. One implementation, one policy check.
   *
   * Defaults to `app`, so existing manifests need no change.
   */
  kind?: 'app' | 'plugin'
  /**
   * Which Driftless versions this package works with — a semver range, e.g.
   * `">=1.0.0 <2.0.0"`.
   *
   * Checked at discovery against `CMS_VERSION`. A package built against a core
   * it does not fit is refused and logged rather than left to fail later in a
   * way that looks like a bug in the CMS. Omitting it means "any version",
   * which is right for the bundled packages that ship in this repo and wrong
   * for anything installed separately.
   */
  engines?: { driftless?: string }
  /**
   * Other modules this one needs, as name → semver range.
   *
   * Declared and checked, not resolved: an unmet requirement refuses to load
   * the dependant and says which module is missing. Nothing is installed
   * automatically — guessing what an operator wants on their own server is not
   * this system's job.
   */
  requires?: { modules?: Record<string, string> }
  label: string
  description: string
  version: string
  /** Enabled on first detection (default: true). */
  autoEnable?: boolean
  /** Permissions minted into the RBAC tables when the module is reconciled. */
  permissions: ModulePermission[]
  /**
   * First-class sidebar nav, shown (filtered by permission) while enabled.
   *
   * An array declares more than one top-level group — e.g. an e-commerce module
   * that owns both a "Shop" group and a separate "Marketing" one. They render
   * as independent groups under "Apps", ordered by their own `order`.
   */
  nav?: ModuleNav | ModuleNav[]
  /**
   * First URL segments this module owns on the public site, e.g. `shop`.
   *
   * The module's own routes are registered before the CMS catch-all, so they
   * already win at request time. Declaring them here stops a builder page from
   * being *created* at a path that can never render — a page silently shadowed
   * forever is worse than one refused when you name it.
   *
   * Core reads this from the registry rather than keeping its own list, so an
   * installed module reserves its paths without core knowing it exists.
   */
  reservedSegments?: string[]
  /**
   * Tables this module owns, in creation order.
   *
   * Two uses: deciding whether the module is installed (do its tables exist?),
   * and knowing what to drop on uninstall. Without it the module can still be
   * enabled and disabled, but the admin UI cannot install or uninstall it —
   * Lucid's rollback has no per-module scoping, so the declared list is the
   * only safe basis for dropping anything.
   *
   * Order matters: uninstall drops in reverse, so a table goes before whatever
   * it references.
   */
  tables?: string[]
  /**
   * Veto an uninstall. Called before anything is dropped.
   *
   * The place to refuse destruction that would lose records the operator cannot
   * recreate — paid orders, issued invoices, anything with a legal retention
   * obligation.
   */
  canUninstall?: () => Promise<{ ok: boolean; reason?: string }>
  /**
   * Called when the module is switched **on** from off.
   *
   * For first-run content a module cannot function without — a storefront's
   * default pages, for instance. Deliberately **not** called at boot:
   * `reconcile()` runs in every process on every start, so creating rows there
   * would mean concurrent writes across the fleet every deploy.
   *
   * Three rules, because this runs against a live database:
   *
   * - **Idempotent.** Enabling twice must not produce two of anything.
   * - **Never overwrite.** If a record already exists, leave it exactly as it
   *   is — an operator who edited it, or deliberately emptied it, must not have
   *   that undone by toggling the module off and on.
   * - **Never fatal.** A failure here is logged and swallowed by the caller.
   *   Seeding convenience content is not a reason to leave a module half
   *   enabled.
   */
  onEnable?: () => Promise<void>
  /**
   * Periodic housekeeping, run by `node ace modules:maintenance`.
   *
   * For work that must happen on a schedule whether or not a queue worker is
   * alive — releasing stock from abandoned checkouts, maturing commissions,
   * pruning append-only tables. Sweeps like those decide who owns inventory and
   * who gets paid, so they must not depend on Redis being up; the queue is an
   * accelerator, not the source of truth.
   *
   * Must be **idempotent and safe to run concurrently** — cron overlaps, and a
   * second invocation while the first is still going is normal. Guard each
   * step with a conditional UPDATE rather than a read-then-write.
   *
   * Returns a short summary of what it did, for the command's output and for
   * whatever collects cron logs.
   */
  maintenance?: () => Promise<Record<string, number>>
  /** Registers the module's routes; always called at boot (guarded per-request). */
  registerRoutes: (router: HttpRouterService, middleware: NamedMiddleware) => void
  /**
   * Called once when an installed module's `version` moves forward.
   *
   * Runs **after** the new migrations and **before** the module is enabled, so
   * it can backfill data the new schema needs. `fromVersion` is what was
   * recorded before this upgrade.
   *
   * Unlike `onEnable`, a failure here is **not** swallowed — but it does not
   * disable the module either. Turning off a package that works because a
   * backfill failed is worse than a backfill that is visibly incomplete; the
   * failure is logged and surfaced, and the operator decides.
   */
  onUpgrade?: (fromVersion: string) => Promise<void> | void
  /** Optional boot hook: register services / listeners / seed at startup. */
  boot?: (app: ApplicationService) => Promise<void> | void
}

/** Identity helper for type-inference + future defaults (mirrors defineConfig). */
export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest
}
