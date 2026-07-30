import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { withRecoveryDb } from '#services/recovery_db'
import { scanModuleFolders } from '#modules/paths'

/**
 * What is installed, what the database thinks of it, and what broke.
 *
 * Runs without booting the application, so it still answers when a module is
 * preventing startup — which is exactly when someone needs to know which one.
 */
export default class ModulesList extends BaseCommand {
  static commandName = 'modules:list'
  static description = 'List installed modules and their state (works without booting the app)'

  static options: CommandOptions = { startApp: false }

  async run() {
    const onDisk = scanModuleFolders()

    let rows: { name: string; enabled: boolean; kind: string; boot_error: string | null }[] = []
    try {
      rows = await withRecoveryDb(async (client) => {
        const result = await client.query(
          'SELECT name, enabled, kind, boot_error FROM modules ORDER BY name'
        )
        return result.rows
      })
    } catch (error) {
      this.logger.warning(`Could not read the modules table: ${(error as Error).message}`)
    }

    /**
     * Which manifests actually loaded. A folder can be present and its row
     * enabled while discovery refused it — an incompatible `engines` range, an
     * unmet requirement, a plugin reaching past its contract. Printing
     * "enabled" for one of those sends the operator looking in the wrong place.
     *
     * Guarded, because this command's whole purpose is to answer when other
     * things are broken.
     */
    let loaded: Set<string> | null = null
    try {
      const registry = await import('#modules/registry')
      loaded = new Set(registry.MODULES.map((m) => m.name))
    } catch {
      loaded = null
    }

    const byName = new Map(rows.map((r) => [r.name, r]))
    const names = [...new Set([...onDisk, ...rows.map((r) => r.name)])].sort()

    if (names.length === 0) {
      this.logger.info('No modules found.')
      return
    }

    for (const name of names) {
      const row = byName.get(name)
      const present = onDisk.includes(name)

      // A row with no folder is the shape left behind by a half-removed
      // install, and worth calling out rather than rendering as "disabled".
      const state = !present
        ? 'MISSING FOLDER'
        : loaded && !loaded.has(name)
          ? 'REFUSED'
          : !row
            ? 'not registered'
            : row.enabled
              ? 'enabled'
              : 'disabled'

      this.logger.info(`${name.padEnd(24)} ${state.padEnd(16)} ${row?.kind ?? '-'}`)
      if (row?.boot_error) this.logger.error(`  boot error: ${row.boot_error}`)
    }
  }
}
