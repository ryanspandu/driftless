import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { writeFile } from 'node:fs/promises'

/**
 * Export the whole site to a `.driftless` archive.
 *
 *   node ace data:export
 *   node ace data:export --out=site.driftless --only=settings,redirects
 */
export default class DataExport extends BaseCommand {
  static commandName = 'data:export'
  static description = 'Export the whole site to a .driftless archive'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Output file (default: site-<timestamp>.driftless)' })
  declare out?: string

  @flags.string({ description: 'Comma-separated section names to include (default: all)' })
  declare only?: string

  @flags.string({ description: 'ID mode: preserve (default) | regenerate' })
  declare mode?: string

  async run() {
    const { default: SiteExportService } =
      await import('#services/data_transfer/site_export_service')
    const only = this.only
      ? this.only
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
    const mode = this.mode === 'regenerate' ? 'regenerate' : 'preserve'
    const buffer = await new SiteExportService().export({ only, mode })
    const out = this.out || `site-${new Date().toISOString().replace(/[:.]/g, '-')}.driftless`
    await writeFile(out, buffer)
    this.logger.success(`Exported ${buffer.length} bytes → ${out}`)
  }
}
