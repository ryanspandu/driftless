import type { ApplicationService } from '@adonisjs/core/types'
import ModulesService from '#services/modules_service'
import { bootModules } from '#modules/registry'

/**
 * Reconciles the module registry against the `modules` table on boot, mints each
 * module's permissions into the RBAC tables, and runs each enabled module's
 * optional boot hook. Mirrors `PluginsProvider`.
 */
export default class ModulesProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const environment = this.app.getEnvironment()
    if (environment !== 'web' && environment !== 'console' && environment !== 'test') {
      return
    }

    const db = await this.app.container.make('lucid.db')
    const hasModulesTable = await db.connection().schema.hasTable('modules')
    if (!hasModulesTable) {
      return
    }

    try {
      const modules = new ModulesService()
      await modules.reconcile()

      const hasPermissions = await db.connection().schema.hasTable('permissions')
      if (hasPermissions) {
        await modules.mintPermissions()
      }

      const enabled = await modules.enabledMap()
      await bootModules(this.app, (name) => enabled.get(name) ?? false)
    } catch (error) {
      // Test DB is migrated per-suite; tables may not exist at app boot yet.
      if (environment === 'test') return
      throw error
    }
  }
}
