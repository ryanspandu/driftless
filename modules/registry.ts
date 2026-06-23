import type { ApplicationService, HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware, ModuleManifest, ModulePermission } from '#modules/types'
import tasks from '#modules/tasks/module'

/**
 * Static module registry. Adding a module = drop its folder under `modules/`
 * and add one import line here, then rebuild (the front-end is bundled at build
 * time, so a fresh module folder needs a single `npm run build`).
 */
export const MODULES: ModuleManifest[] = [tasks]

export function getModule(name: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.name === name)
}

/** Called once at boot from `start/routes.ts`. Routes are guarded per-request. */
export function registerAllModuleRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  for (const mod of MODULES) {
    mod.registerRoutes(router, middleware)
  }
}

/** All permissions declared by all modules (minted by the provider on boot). */
export function allModulePermissions(): ModulePermission[] {
  return MODULES.flatMap((m) => m.permissions)
}

/** Run each enabled module's optional boot hook (services / listeners / seed). */
export async function bootModules(app: ApplicationService, isEnabled: (name: string) => boolean) {
  for (const mod of MODULES) {
    if (mod.boot && isEnabled(mod.name)) {
      await mod.boot(app)
    }
  }
}
