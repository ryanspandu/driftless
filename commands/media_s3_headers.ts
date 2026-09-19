import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Media from '#models/media'
import MediaVariant from '#models/media_variant'
import { MEDIA_CACHE_CONTROL, contentTypeForKey, getStorageDriver } from '#services/media_service'

/**
 * Re-uploads existing bucket objects with a real Content-Type and Cache-Control.
 *
 * Objects written before `S3_PUBLIC_URL` existed carry no metadata, so a public bucket would serve
 * them as `binary/octet-stream`. Run once after turning `S3_PUBLIC_URL` on; safe to repeat.
 */
export default class MediaS3Headers extends BaseCommand {
  static commandName = 'media:s3-headers'
  static description = 'Set Content-Type / Cache-Control on existing media objects in the S3 bucket'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Apply changes (default is dry-run)' })
  declare apply?: boolean

  async run() {
    const keys = new Set<string>()
    for (const media of await Media.query()) keys.add(media.filename)
    for (const variant of await MediaVariant.query()) {
      const name = variant.url.split('/').pop()
      if (name) keys.add(name)
    }

    const driver = await getStorageDriver()
    const scratch = await mkdtemp(join(tmpdir(), 'driftless-s3-headers-'))
    let updated = 0
    let missing = 0
    let skipped = 0

    try {
      for (const key of keys) {
        const contentType = contentTypeForKey(key)
        if (!contentType) {
          skipped++
          continue
        }
        if (!(await driver.exists(key))) {
          missing++
          this.logger.warning(`missing in bucket: ${key}`)
          continue
        }
        if (this.apply) {
          const tmp = join(scratch, key.replace(/\//g, '_'))
          await driver.readToFile(key, tmp)
          await driver.putFile(key, tmp, contentType, MEDIA_CACHE_CONTROL)
          await rm(tmp, { force: true })
        }
        updated++
      }
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }

    this.logger.info(
      `${this.apply ? 'updated' : 'would update'} ${updated}, missing ${missing}, skipped ${skipped}${this.apply ? '' : ' (dry run — pass --apply)'}`
    )
  }
}
