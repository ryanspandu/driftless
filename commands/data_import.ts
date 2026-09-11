import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { readFile } from 'node:fs/promises'
import type { ConflictMode, IdMode } from '#services/data_transfer/registry'

/**
 * Import a `.driftless` archive into this site.
 *
 *   node ace data:import site.driftless
 *   node ace data:import site.driftless --mode=regenerate --conflict=skip --dry-run
 */
export default class DataImport extends BaseCommand {
  static commandName = 'data:import'
  static description = 'Import a .driftless archive into this site'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Path to the .driftless archive' })
  declare file: string

  @flags.string({ description: 'ID mode: preserve (default) | regenerate' })
  declare mode?: string

  @flags.string({ description: 'On conflict: overwrite (default) | skip | replace' })
  declare conflict?: string

  @flags.boolean({ description: 'Parse, validate and report without writing anything' })
  declare dryRun?: boolean

  @flags.string({ description: 'Comma-separated section names to import (default: all)' })
  declare only?: string

  async run() {
    const { default: SiteImportService } =
      await import('#services/data_transfer/site_import_service')
    const buffer = await readFile(this.file)
    const only = this.only
      ? this.only
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
    const mode: IdMode | undefined =
      this.mode === 'regenerate' ? 'regenerate' : this.mode === 'preserve' ? 'preserve' : undefined
    const conflict: ConflictMode | undefined = (['overwrite', 'skip', 'replace'] as const).includes(
      this.conflict as ConflictMode
    )
      ? (this.conflict as ConflictMode)
      : undefined

    const result = await new SiteImportService().import(buffer, {
      mode,
      conflict,
      only,
      dryRun: this.dryRun,
    })

    for (const line of result.log) this.logger.info(line)
    for (const s of result.skipped) this.logger.warning(`skipped ${s.name}: ${s.reason}`)
    this.logger.success(
      `Import ${result.dryRun ? '(dry-run) ' : ''}complete — ${result.sections.length} section(s) applied`
    )
  }
}
