import { DateTime } from 'luxon'
import Page from '#models/page'
import { sanitizePuckDocument } from '#services/html_sanitizer_service'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'
import { rewriteRefs } from '../rewrite_refs.js'

/**
 * Builder + code pages. Ids are preserved (upsert by id) so the template
 * composition columns (`layoutId`/`headerTemplateId`/`footerTemplateId`) and
 * the `"templateId"` / media-URL references embedded in the Puck content keep
 * resolving without rewriting — templates and media preserve their ids/
 * filenames too. `authorId` is set to the importing user (environment-local).
 *
 * A CODE page's `component` is carried, but only renders if that slug exists in
 * the target build's `CODE_PAGES` manifest — flagged in warnings otherwise.
 */
export const pagesSection: DataSection = {
  name: 'pages',
  owner: 'core',
  order: 60,
  label: 'Pages',
  tables: ['pages'],

  async export() {
    const rows = await Page.query().whereNull('deleted_at').orderBy('created_at', 'asc')
    return {
      pages: rows.map((p) => ({
        id: p.id,
        title: p.title,
        path: p.path,
        status: p.status,
        renderMode: p.renderMode,
        kind: p.kind,
        component: p.component,
        content: p.content,
        seo: p.seo,
        layoutId: p.layoutId,
        headerTemplateId: p.headerTemplateId,
        footerTemplateId: p.footerTemplateId,
        hideHeader: p.hideHeader,
        hideFooter: p.hideFooter,
        publishedAt: p.publishedAt ? p.publishedAt.toISO() : null,
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('pages')
    const payload = (data ?? {}) as { pages?: Array<Record<string, unknown>> }
    const regen = ctx.mode === 'regenerate'
    const remap = (v: unknown): string | null => {
      const s = (v as string) ?? null
      return s && regen ? (ctx.idMap.get(s) ?? s) : s
    }

    for (const p of payload.pages ?? []) {
      const id = String(p.id ?? '')
      const targetId = regen ? newUlid() : id || newUlid()
      if (regen && id) ctx.idMap.set(id, targetId)
      const existing = regen ? null : id ? await Page.query().where('id', id).first() : null
      if (existing && ctx.conflict === 'skip') {
        report.skipped++
        continue
      }
      const status = String(p.status ?? 'DRAFT')
      const publishedAtIso = p.publishedAt ? String(p.publishedAt) : null
      const rawContent = (p.content ?? { content: [], root: {} }) as Record<string, unknown>
      const values = {
        title: String(p.title ?? 'Untitled'),
        path: String(p.path ?? ''),
        status: status as 'DRAFT' | 'PUBLISHED',
        renderMode: String(p.renderMode ?? 'SSR') as 'SSR' | 'SSG' | 'CSR',
        kind: String(p.kind ?? 'BUILDER') as 'BUILDER' | 'CODE',
        component: (p.component as string) ?? null,
        content: sanitizePuckDocument(regen ? rewriteRefs(rawContent, ctx.idMap) : rawContent),
        seo: (p.seo ?? {}) as Record<string, unknown>,
        layoutId: remap(p.layoutId),
        headerTemplateId: remap(p.headerTemplateId),
        footerTemplateId: remap(p.footerTemplateId),
        hideHeader: !!p.hideHeader,
        hideFooter: !!p.hideFooter,
        authorId: ctx.authorId,
        publishedAt: publishedAtIso
          ? DateTime.fromISO(publishedAtIso)
          : status === 'PUBLISHED'
            ? DateTime.now()
            : null,
      }
      // Duplicate into a populated site: don't collide on the unique path.
      if (regen) {
        let candidate = values.path
        let n = 2
        while (candidate && (await Page.query().where('path', candidate).first())) {
          candidate = `${values.path}-${n++}`
        }
        values.path = candidate
      }
      try {
        if (existing) {
          existing.merge(values)
          await existing.save()
          report.updated++
        } else {
          await Page.create({ id: targetId, ...values })
          report.created++
        }
      } catch (e) {
        report.warnings.push(`page "${values.path}": ${(e as Error).message}`)
      }
    }
    return report
  },
}
