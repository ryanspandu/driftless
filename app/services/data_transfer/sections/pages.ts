import { DateTime } from 'luxon'
import Page from '#models/page'
import { sanitizePuckDocument } from '#services/html_sanitizer_service'
import { newUlid } from '#services/ulid_service'
import { CUSTOM_TEMPLATES, CODE_TEMPLATES } from '#services/custom_templates.generated'
import { emptyReport, type DataSection } from '../registry.js'
import { rewriteRefs } from '../rewrite_refs.js'

/**
 * Builder + code pages. Ids are preserved (upsert by id) so the template
 * composition columns (`layoutId`/`headerTemplateId`/`footerTemplateId`) and
 * the `"templateId"` / media-URL references embedded in the Puck content keep
 * resolving without rewriting — templates and media preserve their ids/
 * filenames too. `authorId` is set to the importing user (environment-local).
 *
 * CODE (custom-kit) pages carry their code chrome (`codeHeader`/`codeFooter`/
 * `codeLayout`, the `codetpl:<kit>` pointers) and their author `contentFields` —
 * without these a kit page renders as an empty shell. A kit page whose kit is not
 * in the target build is imported as a DRAFT (so it never 404s publicly) with a
 * warning telling the operator to redeploy the target with that kit committed.
 */
const KIT_IDS = new Set<string>(CUSTOM_TEMPLATES.map((k) => k.id))
const CODE_TPL_KITS = new Set<string>(CODE_TEMPLATES.map((k) => k.kit))

/** The kit a `codetpl:<kit>/<type>` pointer targets, or null. */
function codeTplKit(pointer: unknown): string | null {
  const s = typeof pointer === 'string' ? pointer : ''
  if (!s.startsWith('codetpl:')) return null
  return s.slice('codetpl:'.length).split('/')[0] || null
}

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
        codeHeader: p.codeHeader,
        codeFooter: p.codeFooter,
        codeLayout: p.codeLayout,
        contentFields: p.contentFields,
        hideHeader: p.hideHeader,
        hideFooter: p.hideFooter,
        designBrief: p.designBrief,
        draftContent: p.draftContent,
        draftSeo: p.draftSeo,
        draftContentFields: p.draftContentFields,
        draftUpdatedAt: p.draftUpdatedAt ? p.draftUpdatedAt.toISO() : null,
        scheduledPublishAt: p.scheduledPublishAt ? p.scheduledPublishAt.toISO() : null,
        scheduledUnpublishAt: p.scheduledUnpublishAt ? p.scheduledUnpublishAt.toISO() : null,
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
    /** Rewrite refs inside a JSON blob in regenerate mode; pass through otherwise. */
    const rw = <T>(v: T): T => (regen ? rewriteRefs(v, ctx.idMap) : v)
    const parseDate = (v: unknown) => (v ? DateTime.fromISO(String(v)) : null)

    for (const p of payload.pages ?? []) {
      const id = String(p.id ?? '')
      const targetId = regen ? newUlid() : id || newUlid()
      if (regen && id) ctx.idMap.set(id, targetId)
      const existing = regen ? null : id ? await Page.query().where('id', id).first() : null
      if (existing && ctx.conflict === 'skip') {
        report.skipped++
        continue
      }

      // Preflight: a kit page or code-chrome pointer whose kit is missing from the
      // target build cannot render. Draft the page (never 404 publicly) and warn.
      const component = (p.component as string) ?? null
      const pageKit = component?.startsWith('kit:') ? component.slice(4) : null
      const missingKit = pageKit && !KIT_IDS.has(pageKit)
      for (const chrome of [p.codeHeader, p.codeFooter, p.codeLayout]) {
        const k = codeTplKit(chrome)
        if (k && !CODE_TPL_KITS.has(k)) {
          report.warnings.push(
            `page "${String(p.path ?? '')}": code template kit "${k}" is not built on the target — chrome will be inert until you redeploy with that kit committed`
          )
        }
      }

      let status = String(p.status ?? 'DRAFT')
      if (missingKit) {
        status = 'DRAFT'
        report.warnings.push(
          `page "${String(p.path ?? '')}": kit "${pageKit}" is not built on the target — imported as DRAFT; redeploy the target with this kit committed to activate it`
        )
      }

      const publishedAtIso = p.publishedAt ? String(p.publishedAt) : null
      const rawContent = (p.content ?? { content: [], root: {} }) as Record<string, unknown>
      const rawDraft = (p.draftContent ?? null) as Record<string, unknown> | null
      const values = {
        title: String(p.title ?? 'Untitled'),
        path: String(p.path ?? ''),
        status: status as 'DRAFT' | 'PUBLISHED',
        renderMode: String(p.renderMode ?? 'SSR') as 'SSR' | 'SSG' | 'CSR',
        kind: String(p.kind ?? 'BUILDER') as 'BUILDER' | 'CODE',
        component,
        content: sanitizePuckDocument(rw(rawContent)),
        seo: rw((p.seo ?? {}) as Record<string, unknown>),
        layoutId: remap(p.layoutId),
        headerTemplateId: remap(p.headerTemplateId),
        footerTemplateId: remap(p.footerTemplateId),
        // codetpl pointers are tied to the kit folder id (never regenerated).
        codeHeader: (p.codeHeader as string) ?? null,
        codeFooter: (p.codeFooter as string) ?? null,
        codeLayout: (p.codeLayout as string) ?? null,
        contentFields: p.contentFields ? rw(p.contentFields as Record<string, unknown>) : null,
        hideHeader: !!p.hideHeader,
        hideFooter: !!p.hideFooter,
        designBrief: (p.designBrief as Record<string, unknown>) ?? null,
        draftContent: rawDraft ? sanitizePuckDocument(rw(rawDraft)) : null,
        draftSeo: p.draftSeo ? rw(p.draftSeo as Record<string, unknown>) : null,
        draftContentFields: p.draftContentFields
          ? rw(p.draftContentFields as Record<string, unknown>)
          : null,
        draftUpdatedAt: parseDate(p.draftUpdatedAt),
        scheduledPublishAt: parseDate(p.scheduledPublishAt),
        scheduledUnpublishAt: parseDate(p.scheduledUnpublishAt),
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
