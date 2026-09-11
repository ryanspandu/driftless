import Redirect from '#models/redirect'
import RedirectsService from '#services/redirects_service'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * 301/302 redirects. Natural key is `from_path` (globally unique), so import
 * upserts on it: overwrite the destination, or skip when it already exists.
 */
export const redirectsSection: DataSection = {
  name: 'redirects',
  owner: 'core',
  order: 72,
  label: 'Redirects',
  tables: ['redirects'],

  async export() {
    const rows = await new RedirectsService().list()
    return {
      redirects: rows.map((r) => ({
        id: r.id,
        fromPath: r.fromPath,
        toPath: r.toPath,
        status: r.status,
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('redirects')
    const payload = (data ?? {}) as {
      redirects?: Array<{ id?: string; fromPath: string; toPath: string; status?: number }>
    }
    for (const r of payload.redirects ?? []) {
      const status = r.status === 302 ? 302 : 301
      const existing = await Redirect.query().where('from_path', r.fromPath).first()
      if (existing) {
        if (ctx.conflict === 'skip') {
          report.skipped++
          continue
        }
        existing.toPath = r.toPath
        existing.status = status
        await existing.save()
        report.updated++
      } else {
        await Redirect.create({
          id: ctx.mode === 'preserve' && r.id ? r.id : newUlid(),
          fromPath: r.fromPath,
          toPath: r.toPath,
          status,
        })
        report.created++
      }
    }
    return report
  },
}
