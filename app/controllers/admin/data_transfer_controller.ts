import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import ModulesService from '#services/modules_service'
import {
  registeredDataSections,
  type ConflictMode,
  type IdMode,
} from '#services/data_transfer/registry'

/**
 * Admin surface for whole-site export/import. Thin over the engine services:
 * `manifest` lists the sections the operator can pick, `exportArchive` streams a
 * `.driftless` download, `importArchive` ingests an uploaded one. Gated by
 * `settings:manage` on the routes.
 */
export default class DataTransferController {
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/settings/data_transfer', {})
  }

  /** The sections available to export right now (core + enabled modules). */
  async manifest({ response }: HttpContext) {
    const enabled = await new ModulesService().enabledMap()
    const sections = registeredDataSections()
      .filter((s) => s.owner === 'core' || enabled.get(s.owner))
      .map((s) => ({ name: s.name, label: s.label ?? s.name, owner: s.owner }))
    return response.json({ sections })
  }

  async exportArchive({ request, response }: HttpContext) {
    const { default: SiteExportService } =
      await import('#services/data_transfer/site_export_service')
    const onlyRaw = request.input('only')
    const only = Array.isArray(onlyRaw)
      ? (onlyRaw as string[])
      : typeof onlyRaw === 'string' && onlyRaw
        ? onlyRaw.split(',').filter(Boolean)
        : undefined
    const mode: IdMode = request.input('mode') === 'regenerate' ? 'regenerate' : 'preserve'

    let buffer: Buffer
    try {
      buffer = await new SiteExportService().export({ only, mode })
    } catch (e) {
      // Surface a clean 422 with the reason instead of an unhandled 500 (mirrors
      // importArchive), so the UI shows why the export failed.
      return response.status(422).json({ message: (e as Error).message })
    }
    const stamp = new Date().toISOString().slice(0, 10)
    return response
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="site-${stamp}.driftless"`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .send(buffer)
  }

  async importArchive({ request, auth, response }: HttpContext) {
    const file = request.file('archive', { size: '200mb' })
    if (!file || !file.tmpPath) {
      return response.status(422).json({ message: 'An `archive` file is required' })
    }
    const buffer = await readFile(file.tmpPath)

    const modeIn = String(request.input('mode') ?? '')
    const conflictIn = String(request.input('conflict') ?? '')
    const onlyIn = String(request.input('only') ?? '')
    const dryRun = request.input('dryRun') === 'true' || request.input('dryRun') === true

    const { default: SiteImportService } =
      await import('#services/data_transfer/site_import_service')
    try {
      const result = await new SiteImportService().import(buffer, {
        mode:
          modeIn === 'regenerate' ? 'regenerate' : modeIn === 'preserve' ? 'preserve' : undefined,
        conflict: (['overwrite', 'skip', 'replace'] as ConflictMode[]).includes(
          conflictIn as ConflictMode
        )
          ? (conflictIn as ConflictMode)
          : undefined,
        only: onlyIn ? onlyIn.split(',').filter(Boolean) : undefined,
        dryRun,
        authorId: auth.user?.id ?? null,
      })
      return response.json(result)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
