import type { HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware, PluginManifest, PluginPermission } from '#plugins/types'
import announcements from '#plugins/announcements/plugin'

/**
 * Static plugin registry. Adding a plugin = drop its folder under `plugins/`
 * and add one import line here, then rebuild. (Front-end is bundled at build
 * time, so a fresh plugin folder needs a single `npm run build`.)
 */
export const PLUGINS: PluginManifest[] = [announcements]

export function getPlugin(name: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.name === name)
}

/** Called once at boot from `start/routes.ts`. Routes are guarded per-request. */
export function registerAllPluginRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  for (const plugin of PLUGINS) {
    plugin.registerRoutes(router, middleware)
  }
}

/** All permissions declared by all plugins (minted by the provider on boot). */
export function allPluginPermissions(): PluginPermission[] {
  return PLUGINS.flatMap((p) => p.permissions)
}
