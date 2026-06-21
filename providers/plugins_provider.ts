import type { ApplicationService } from '@adonisjs/core/types'
import PluginsService from '#services/plugins_service'

/**
 * Reconciles the plugin registry against the `plugins` table on boot and mints
 * each plugin's permissions into the RBAC tables. Mirrors `CmsProvider`.
 */
export default class PluginsProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const environment = this.app.getEnvironment()
    if (environment !== 'web' && environment !== 'console' && environment !== 'test') {
      return
    }

    const db = await this.app.container.make('lucid.db')
    const hasPluginsTable = await db.connection().schema.hasTable('plugins')
    if (!hasPluginsTable) {
      return
    }

    try {
      const plugins = new PluginsService()
      await plugins.reconcile()

      const hasPermissions = await db.connection().schema.hasTable('permissions')
      if (hasPermissions) {
        await plugins.mintPermissions()
      }
    } catch (error) {
      // Test DB is migrated per-suite; tables may not exist at app boot yet.
      if (environment === 'test') return
      throw error
    }
  }
}
