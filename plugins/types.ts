import type { HttpRouterService } from '@adonisjs/core/types'
import type { middleware } from '#start/kernel'

/** The app's named-middleware collection (includes `pluginEnabled`). */
export type NamedMiddleware = typeof middleware

export interface PluginPermission {
  name: string
  description: string
}

export interface PluginAdminMenu {
  title: string
  href: string
  /** lucide-react icon name, resolved on the client (see sidebar icon map). */
  icon: string
}

/**
 * A plugin lives in `plugins/<name>/` and co-locates its back-end (routes,
 * controllers, services, models, migrations) with its front-end (`ui/`).
 * The manifest is the single entry point the core wires up.
 */
export interface PluginManifest {
  /** Unique, equals the folder name, used as the toggle key. */
  name: string
  label: string
  description: string
  version: string
  /** Enabled on first detection (default: true). */
  autoEnable?: boolean
  /** Permissions minted into the RBAC tables when the plugin is reconciled. */
  permissions: PluginPermission[]
  /** Sidebar entry shown only while the plugin is enabled. */
  adminMenu?: PluginAdminMenu
  /** Registers the plugin's routes; always called at boot (guarded per-request). */
  registerRoutes: (router: HttpRouterService, middleware: NamedMiddleware) => void
}
