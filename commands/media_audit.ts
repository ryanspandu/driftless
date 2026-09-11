import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileTypeFromFile } from 'file-type'
import Media from '#models/media'
import MediaService from '#services/media_service'
import { sanitizeSvg } from '#services/html_sanitizer_service'

/**
 * Inventories existing media before the non-public storage policy is enabled.
 * Default mode is read-only; --apply moves safe files into controlled storage
 * and quarantines unknown/unsafe bytes rather than deleting them.
 */
export default class MediaAudit extends BaseCommand {
  static commandName = 'media:audit'
  static description = 'Inventory, sanitize, and quarantine existing media files'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Apply moves/sanitization (default is dry-run)' })
  declare apply?: boolean

  async run() {
    const service = new MediaService()
    const controlled = service.storagePath
    const legacy = this.app.publicPath('uploads')
    const quarantine = this.app.makePath('storage/media-quarantine')
    const allowed = new Set([
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])
    let safe = 0
    let unsafe = 0
    let missing = 0

    for (const media of await Media.query()) {
      const filename = basename(media.filename)
      const candidates = [join(controlled, filename), join(legacy, filename)]
      const source = candidates.find((path) => existsSync(path))
      if (!source) {
        missing++
        this.logger.warning(`missing ${filename}`)
        continue
      }
      let sanitizedSvg: string | null | undefined
      const prefix = (await readFile(source)).subarray(0, 1024).toString('utf8')
      if (/^\s*<svg(?:\s|>)/i.test(prefix)) sanitizedSvg = sanitizeSvg(await readFile(source, 'utf8'))
      const detected = sanitizedSvg === undefined ? await fileTypeFromFile(source) : undefined
      const valid = Boolean(sanitizedSvg || (detected && allowed.has(detected.mime)))
      if (!valid) {
        unsafe++
        this.logger.warning(`quarantine ${filename} (unrecognized or unsafe bytes)`)
        if (this.apply) {
          await mkdir(quarantine, { recursive: true })
          await rename(source, join(quarantine, filename))
        }
        continue
      }
      safe++
      this.logger.info(`${this.apply ? 'migrate' : 'safe'} ${filename}`)
      if (this.apply && source !== join(controlled, filename)) {
        await mkdir(controlled, { recursive: true })
        if (sanitizedSvg) await writeFile(join(controlled, filename), sanitizedSvg)
        else await rename(source, join(controlled, filename))
      } else if (this.apply && sanitizedSvg) {
        await writeFile(source, sanitizedSvg)
      }
    }
    this.logger.success(`${this.apply ? 'Applied' : 'Dry-run'}: ${safe} safe, ${unsafe} quarantined, ${missing} missing`)
  }
}
