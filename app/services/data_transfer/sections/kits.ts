import TemplateKitsService from '#services/template_kits_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Custom-code template kits (`inertia/custom/kits/<id>/`). These are files on
 * disk, not DB rows, so each kit is bundled as its own gzipped-tar archive
 * (base64 in the section JSON) and re-imported through `TemplateKitsService`,
 * reusing its traversal guard + dedupe.
 *
 * Kits are build-time: an imported kit is staged to disk but is NOT routable
 * until the template generator re-runs and the front-end is rebuilt + the
 * server restarts (flagged in the report). Ids are always preserved (a kit id
 * is its folder name); `regenerate` mode does not apply.
 */
export const kitsSection: DataSection = {
  name: 'kits',
  owner: 'core',
  order: 75,
  label: 'Template kits (code)',

  async export() {
    const svc = new TemplateKitsService()
    const kits: Array<{ id: string; archive: string }> = []
    for (const kit of await svc.list()) {
      try {
        const buf = await svc.exportKit(kit.id)
        kits.push({ id: kit.id, archive: buf.toString('base64') })
      } catch {
        // A malformed / empty kit folder is skipped rather than failing export.
      }
    }
    return { kits }
  },

  async import(ctx, data) {
    const report = emptyReport('kits')
    const payload = (data ?? {}) as { kits?: Array<{ id?: string; archive?: string }> }
    const svc = new TemplateKitsService()
    let installed = 0

    for (const kit of payload.kits ?? []) {
      if (typeof kit.archive !== 'string' || !kit.archive) continue
      try {
        const buffer = Buffer.from(kit.archive, 'base64')
        const result = await svc.importKit(buffer, kit.id)
        report.created++
        installed++
        ctx.log(`kit "${result.id}" staged (${result.files} files)`)
      } catch (e) {
        // Already exists / disallowed entry → skip, don't fail the whole import.
        report.skipped++
        report.warnings.push(`kit "${kit.id ?? '?'}": ${(e as Error).message}`)
      }
    }

    if (installed > 0) {
      ctx.log(
        `${installed} kit(s) staged — run the template generator and rebuild + restart to activate them.`
      )
    }
    return report
  },
}
