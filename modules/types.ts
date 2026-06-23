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
 * a plugin, a module is first-party core code: it gets a first-class "Apps"
 * sidebar group, may freely import core (`~/components`, `#services`, …), and is
 * toggled at runtime from Settings. Core code must never import a module.
 */
export interface ModuleManifest {
  /** Unique key, equals the folder name under `modules/`. */
  name: string
  label: string
  description: string
  version: string
  /** Enabled on first detection (default: true). */
  autoEnable?: boolean
  /** Permissions minted into the RBAC tables when the module is reconciled. */
  permissions: ModulePermission[]
  /** First-class sidebar nav, shown (filtered by permission) while enabled. */
  nav?: ModuleNav
  /** Registers the module's routes; always called at boot (guarded per-request). */
  registerRoutes: (router: HttpRouterService, middleware: NamedMiddleware) => void
  /** Optional boot hook: register services / listeners / seed at startup. */
  boot?: (app: ApplicationService) => Promise<void> | void
}

/** Identity helper for type-inference + future defaults (mirrors defineConfig). */
export function defineModule(manifest: ModuleManifest): ModuleManifest {
  return manifest
}
