import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Remove a module's schema and data.
 *
 *   node ace modules:uninstall <name> --confirm=<name>
 *
 * The only operation in this system with no undo: it drops the module's tables.
 * Everything else here is recoverable — a bad release rolls back, a broken
 * module is quarantined, a folder can be put back. This cannot be, which is why
 * it asks for the name twice.
 *
 * The folder itself is left alone. Removing files is the operator's call, and
 * doing it here would make "uninstall" mean two different things at once.
 */
export default class ModulesUninstall extends BaseCommand {
  static commandName = 'modules:uninstall'
  static description = "Drop a module's tables and revoke its permissions (irreversible)"

  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Module name' })
  declare name: string

  @flags.string({ description: 'Repeat the module name to confirm' })
  declare confirm?: string

  @flags.boolean({ description: 'Also move the folder into shared/backups/' })
  declare removeFolder?: boolean

  async run() {
    if (this.confirm !== this.name) {
      this.logger.error(`This drops every table "${this.name}" owns. The data is not recoverable.`)
      this.logger.info(`Run: node ace modules:uninstall ${this.name} --confirm=${this.name}`)
      this.exitCode = 1
      return
    }

    const { default: ModulesService } = await import('#services/modules_service')
    const { default: SchemaInstallerService } = await import('#services/schema_installer_service')

    const modules = new ModulesService()

    /**
     * The manifest's own veto. E-commerce refuses while any order has been
     * paid, because dropping those tables destroys the record of money that
     * changed hands.
     */
    const verdict = await modules.canUninstall(this.name)
    if (!verdict.ok) {
      this.logger.error(verdict.reason ?? 'This module refused to be uninstalled.')
      this.exitCode = 1
      return
    }

    // Disable first, so no request can reach a half-dropped module.
    await modules.setEnabled(this.name, false)

    const tables = modules.tablesFor(this.name)

    try {
      const result = await new SchemaInstallerService().uninstall({ name: this.name, tables })

      for (const table of result.droppedTables) this.logger.success(`dropped ${table}`)
      this.logger.info(`forgot ${result.forgottenMigrations} migration record(s)`)

      const revoked = await modules.revokePermissions(this.name)
      for (const permission of revoked) this.logger.success(`revoked ${permission}`)
    } catch (error) {
      this.logger.error(`Uninstall failed: ${(error as Error).message}`)
      this.exitCode = 1
      return
    }

    if (this.removeFolder) {
      /**
       * Moved aside, never deleted. Bytes on someone else's server are not ours
       * to destroy, and an operator who uninstalls the wrong thing at 2am needs
       * the folder to still exist. `modules:maintenance` sweeps backups older
       * than 30 days.
       */
      const { mkdirSync, renameSync } = await import('node:fs')
      const { join } = await import('node:path')

      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backups = this.app.makePath('shared/backups')
      const destination = join(backups, `${this.name}-${stamp}`)

      mkdirSync(backups, { recursive: true })
      renameSync(this.app.makePath(`modules/${this.name}`), destination)
      this.logger.success(`folder moved to shared/backups/${this.name}-${stamp}`)
    }

    this.logger.success(`${this.name} is uninstalled.`)

    if (!this.removeFolder) {
      this.logger.info(
        `Its folder is still at modules/${this.name}. Re-run with --remove-folder to move it into shared/backups/, or leave it and run \`modules:install ${this.name}\` to start over.`
      )
    }
  }
}
