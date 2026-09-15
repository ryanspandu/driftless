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
  // The per-kit activation flag lives here; the kit FILES are bundled separately
  // (base64 tar per kit). Declaring the table lets conflict:'replace' reset it.
  tables: ['template_kits'],

  async export() {
    const svc = new TemplateKitsService()
    const kits: Array<{ id: string; archive: string; active: boolean }> = []
    for (const kit of await svc.list()) {
      try {
        const buf = await svc.exportKit(kit.id)
        kits.push({ id: kit.id, archive: buf.toString('base64'), active: kit.active })
      } catch {
        // A malformed / empty kit folder is skipped rather than failing export.
      }
    }
    return { kits }
  },

  async import(ctx, data) {
    const report = emptyReport('kits')
    const payload = (data ?? {}) as {
      kits?: Array<{ id?: string; archive?: string; active?: boolean }>
    }
    const svc = new TemplateKitsService()
    let installed = 0

    for (const kit of payload.kits ?? []) {
      if (typeof kit.archive !== 'string' || !kit.archive) continue
      const wantActive = !!kit.active
      try {
        const buffer = Buffer.from(kit.archive, 'base64')
        const result = await svc.importKit(buffer, kit.id)
        report.created++
        installed++
        if (wantActive) {
          try {
            await svc.setActive(result.id, true)
          } catch {
            /* activation is best-effort — the file staging is what matters */
          }
        }
        ctx.log(`kit "${result.id}" staged (${result.files} files)`)
      } catch (e) {
        // Already exists / disallowed entry → skip, don't fail the whole import.
        report.skipped++
        report.warnings.push(`kit "${kit.id ?? '?'}": ${(e as Error).message}`)
        // Honour the active flag even when the kit was already present on disk.
        if (wantActive && kit.id) {
          try {
            await svc.setActive(String(kit.id), true)
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (installed > 0) {
      // Be honest: kit code is compiled at BUILD time. On an immutable/built
      // deploy (e.g. Railway) a kit staged to disk at runtime is neither compiled
      // into the running bundle nor kept across the next deploy. The pages that
      // reference these kits were imported as drafts (see the pages section).
      const msg =
        `${installed} kit(s) staged to disk. They are NOT live yet: kit code is build-time, ` +
        `so you must COMMIT these kit files to the target's repo and redeploy for their pages/` +
        `templates to render. A running server cannot rebuild itself.`
      ctx.log(msg)
      report.warnings.push(msg)
    }
    return report
  },
}
