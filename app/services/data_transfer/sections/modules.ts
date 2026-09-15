import db from '@adonisjs/lucid/services/db'
import ModulesService from '#services/modules_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Module enable-state (the `modules` table's on/off flags). Runs FIRST (order 5)
 * so a module the archive enables — e.g. ecommerce, which ships
 * `autoEnable: false` — is switched on before its own data section tries to
 * import. The import engine re-reads the enabled map immediately after this
 * section, so the later module-owned sections are gated on the restored state.
 *
 * Only the enable-state travels: `kind`/`source`/`version` are manifest-owned
 * and environment-local. A module absent from the target build is skipped with a
 * warning rather than crashing the run. `setEnabled` upserts the row, busts the
 * cache and runs the module's `onEnable` hook (permissions + seed content).
 *
 * No `tables` are declared: the row must never be wiped by `conflict:'replace'`
 * (that would drop every module row); it is reconciled by name instead.
 */
export const modulesSection: DataSection = {
  name: 'modules',
  owner: 'core',
  order: 5,
  label: 'Modules (enabled state)',

  async export() {
    const rows = await db.from('modules').select('name', 'enabled')
    return { modules: rows.map((r) => ({ name: String(r.name), enabled: !!r.enabled })) }
  },

  async import(ctx, data) {
    const report = emptyReport('modules')
    const payload = (data ?? {}) as { modules?: Array<{ name?: string; enabled?: boolean }> }
    const svc = new ModulesService()
    for (const m of payload.modules ?? []) {
      const name = String(m.name ?? '')
      if (!name) continue
      try {
        await svc.setEnabled(name, !!m.enabled)
        report.updated++
        ctx.log(`module "${name}" → ${m.enabled ? 'enabled' : 'disabled'}`)
      } catch (e) {
        // Module isn't part of this build — nothing to toggle here.
        report.skipped++
        report.warnings.push(`module "${name}": ${(e as Error).message}`)
      }
    }
    return report
  },
}
