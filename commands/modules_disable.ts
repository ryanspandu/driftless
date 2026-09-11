import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { withRecoveryDb } from '#services/recovery_db'

/**
 * Switch a module off from a shell, without booting the application.
 *
 * The escape hatch for a module that breaks startup badly enough that the admin
 * screen is unreachable. `modules:safe-mode` is the blunter instrument; this one
 * lets the rest of the site keep running.
 */
export default class ModulesDisable extends BaseCommand {
  static commandName = 'modules:disable'
  static description = 'Disable a module directly in the database (works without booting the app)'

  static options: CommandOptions = { startApp: false }

  @args.string({ description: 'Module name', required: false })
  declare name?: string

  @flags.boolean({ description: 'Disable every module' })
  declare all?: boolean

  async run() {
    if (!this.name && !this.all) {
      this.logger.error('Give a module name, or --all.')
      this.exitCode = 1
      return
    }

    try {
      const disabled = await withRecoveryDb(async (client) => {
        const result = this.all
          ? await client.query('UPDATE modules SET enabled = false RETURNING name')
          : await client.query('UPDATE modules SET enabled = false WHERE name = $1 RETURNING name', [
              this.name,
            ])
        return result.rows.map((r: { name: string }) => r.name)
      })

      if (disabled.length === 0) {
        this.logger.warning(`No module named "${this.name}".`)
        this.exitCode = 1
        return
      }

      for (const name of disabled) this.logger.success(`disabled ${name}`)

      /**
       * Every process caches the enabled map for ten seconds, so the change is
       * live shortly without a restart. Saying so avoids a needless one.
       */
      this.logger.info('Takes effect within ~10s; no restart needed.')
    } catch (error) {
      this.logger.error((error as Error).message)
      this.exitCode = 1
    }
  }
}
