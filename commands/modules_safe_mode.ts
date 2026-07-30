import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Turn safe mode on or off by writing the sentinel file.
 *
 * The file rather than the environment variable, because this has to work for
 * someone with nothing but SSH — no supervisor config, no ability to restart
 * with a different env. See `SAFE_MODE` in `modules/registry.ts`.
 */
export default class ModulesSafeMode extends BaseCommand {
  static commandName = 'modules:safe-mode'
  static description = 'Boot with no modules at all (works without booting the app)'

  static options: CommandOptions = { startApp: false }

  @flags.boolean({ description: 'Turn safe mode on' })
  declare on?: boolean

  @flags.boolean({ description: 'Turn safe mode off' })
  declare off?: boolean

  async run() {
    const sentinel = this.app.makePath('tmp/SAFE_MODE')

    if (this.on === this.off) {
      this.logger.info(existsSync(sentinel) ? 'Safe mode is ON.' : 'Safe mode is OFF.')
      this.logger.info('Pass --on or --off to change it.')
      return
    }

    if (this.on) {
      mkdirSync(dirname(sentinel), { recursive: true })
      writeFileSync(sentinel, `${new Date().toISOString()}\n`)
      this.logger.success('Safe mode ON — restart Driftless to boot without modules.')
      return
    }

    rmSync(sentinel, { force: true })
    this.logger.success('Safe mode OFF — restart Driftless to load modules again.')
  }
}
