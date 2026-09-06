import Template, { type TemplateType } from '#models/template'
import { sanitizePuckDocument } from '#services/html_sanitizer_service'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'
import { rewriteRefs } from '../rewrite_refs.js'

/**
 * Reusable templates (HEADER/FOOTER/LAYOUT/COMPONENT/EMAIL/COLLECTION). Their
 * ids are preserved: pages reference them by id (in columns and embedded in
 * Puck content as `"templateId":"<id>"`), and templates can nest other
 * templates the same way — preserving ids means none of that has to be
 * rewritten. Model-level upsert by id (the service's `create` mints ids).
 */
export const templatesSection: DataSection = {
  name: 'templates',
  owner: 'core',
  order: 40,
  label: 'Templates',
  tables: ['templates'],

  async export() {
    const rows = await Template.query().whereNull('deleted_at').orderBy('created_at', 'asc')
    return {
      templates: rows.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        isDefault: t.isDefault,
        collectionKey: t.collectionKey,
        content: t.content,
        renderedHtml: t.renderedHtml,
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('templates')
    const payload = (data ?? {}) as {
      templates?: Array<{
        id?: string
        name: string
        type: string
        isDefault?: boolean
        collectionKey?: string | null
        content?: Record<string, unknown>
        renderedHtml?: string | null
      }>
    }
    const templates = payload.templates ?? []
    const regen = ctx.mode === 'regenerate'

    // Regenerate: allocate every template's new id up front so a template that
    // references another (a nested TemplateRef in its content) rewrites to the
    // correct new id in the single pass below.
    const newIdFor = new Map<string, string>()
    if (regen) {
      for (const t of templates) {
        const nid = newUlid()
        newIdFor.set(t.id ?? nid, nid)
        if (t.id) ctx.idMap.set(t.id, nid)
      }
    }

    for (const t of templates) {
      const targetId = regen ? (newIdFor.get(t.id ?? '') ?? newUlid()) : t.id || newUlid()
      const existing = regen ? null : t.id ? await Template.query().where('id', t.id).first() : null
      if (existing && ctx.conflict === 'skip') {
        report.skipped++
        continue
      }
      const rawContent = (t.content ?? { content: [], root: {} }) as Record<string, unknown>
      const values = {
        name: t.name,
        type: t.type as TemplateType,
        isDefault: !!t.isDefault,
        collectionKey: t.collectionKey ?? null,
        content: sanitizePuckDocument(regen ? rewriteRefs(rawContent, ctx.idMap) : rawContent),
        renderedHtml: t.renderedHtml ?? null,
      }
      try {
        if (existing) {
          existing.merge(values)
          await existing.save()
          report.updated++
        } else {
          await Template.create({ id: targetId, ...values })
          report.created++
        }
      } catch (e) {
        report.warnings.push(`template "${t.name}": ${(e as Error).message}`)
      }
    }
    return report
  },
}
