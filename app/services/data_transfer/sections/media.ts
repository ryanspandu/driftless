import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import Media from '#models/media'
import MediaService from '#services/media_service'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * The media library: the `media` rows AND their original file bytes, bundled
 * under `media/<filename>` in the archive.
 *
 * Strategy A — the ULID filenames are preserved on import, so every reference by
 * URL (Puck Image blocks, product images, `web_settings` values) and by id (CMS
 * MEDIA fields) keeps resolving as long as the target uses the same
 * `MEDIA_URL_PREFIX` (the default `/uploads`). Webp `MediaVariant` derivatives
 * are NOT bundled — they carry independent ULID filenames and are regenerated
 * lazily/on next reprocess; the original always renders.
 *
 * `author_id` is dropped: it is an environment-specific user FK.
 */
export const mediaSection: DataSection = {
  name: 'media',
  owner: 'core',
  order: 10,
  label: 'Media library',
  tables: ['media', 'media_variants'],

  async export(ctx) {
    const service = new MediaService()
    const rows = await Media.query().whereNull('deleted_at').orderBy('created_at', 'asc')
    const meta: Array<Record<string, unknown>> = []
    for (const m of rows) {
      const path = service.resolveFilePath(m.filename)
      if (!path) continue // file missing on disk — skip the orphan row
      const { readFile } = await import('node:fs/promises')
      ctx.addFile(m.filename, await readFile(path))
      meta.push({
        id: m.id,
        filename: m.filename,
        mimeType: m.mimeType,
        size: m.size,
        url: m.url,
        title: m.title,
        description: m.description,
        alt: m.alt,
        width: m.width,
        height: m.height,
        origin: m.origin,
        sourceUrl: m.sourceUrl,
        sourceMediaId: m.sourceMediaId,
      })
    }
    return { media: meta }
  },

  async import(ctx, data) {
    const report = emptyReport('media')
    const payload = (data ?? {}) as { media?: Array<Record<string, unknown>> }
    const service = new MediaService()
    const dir = service.storagePath
    await mkdir(dir, { recursive: true })

    for (const m of payload.media ?? []) {
      const filename = String(m.filename ?? '')
      if (!filename || /[\\/]/.test(filename) || filename.includes('..')) {
        report.warnings.push(`skipped media with unsafe filename "${filename}"`)
        continue
      }
      const bytes = ctx.getFile(`media/${filename}`)
      const id = String(m.id ?? '')
      const existing = id ? await Media.query().where('id', id).first() : null

      if (existing && ctx.conflict === 'skip') {
        report.skipped++
        continue
      }

      if (bytes) await writeFile(join(dir, filename), bytes)

      const values = {
        filename,
        mimeType: String(m.mimeType ?? 'application/octet-stream'),
        size: Number(m.size ?? bytes?.length ?? 0),
        url: String(m.url ?? ''),
        title: (m.title as string) ?? null,
        description: (m.description as string) ?? null,
        alt: (m.alt as string) ?? null,
        width: (m.width as number) ?? null,
        height: (m.height as number) ?? null,
        origin: String(m.origin ?? 'upload'),
        sourceUrl: (m.sourceUrl as string) ?? null,
        sourceMediaId: (m.sourceMediaId as string) ?? null,
        authorId: ctx.authorId,
      }

      if (existing) {
        existing.merge(values)
        await existing.save()
        report.updated++
      } else {
        await Media.create({ id: id || newUlid(), ...values })
        report.created++
      }
    }
    return report
  },
}
