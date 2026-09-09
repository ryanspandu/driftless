import Content from '#models/content'
import { sanitizeRichText } from '#services/html_sanitizer_service'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'
import { rewriteRefs } from '../rewrite_refs.js'

/**
 * The built-in Content posts (`contents` table). Carries the dynamic custom
 * fields (`data`, defined by the Content-type collection) and the native
 * `featuredImage` URL alongside title/slug/body/status.
 *
 * Ids are preserved (upsert by id). `featuredImage` is a media URL, which the
 * media section preserves as-is, so it needs no remap. In `regenerate` mode the
 * relation ids inside `data` (e.g. category record ids) are rewritten through
 * the engine's `idMap` — which the collection-records section (order 50, before
 * this) has already populated. `authorId` becomes the importing user.
 */
export const contentSection: DataSection = {
  name: 'content',
  owner: 'core',
  order: 55,
  label: 'Content (posts)',
  tables: ['contents'],

  async export() {
    const rows = await Content.query().whereNull('deleted_at').orderBy('created_at', 'asc')
    return {
      content: rows.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        body: c.body,
        status: c.status,
        data: c.data ?? null,
        featuredImage: c.featuredImage ?? null,
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('content')
    const payload = (data ?? {}) as { content?: Array<Record<string, unknown>> }
    const regen = ctx.mode === 'regenerate'

    for (const row of payload.content ?? []) {
      const id = String(row.id ?? '')
      const targetId = regen ? newUlid() : id || newUlid()
      if (regen && id) ctx.idMap.set(id, targetId)
      const existing = regen ? null : id ? await Content.query().where('id', id).first() : null
      if (existing && ctx.conflict === 'skip') {
        report.skipped++
        continue
      }

      const status = String(row.status ?? 'DRAFT') === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
      const rawData = (row.data ?? null) as Record<string, unknown> | null
      const values = {
        title: String(row.title ?? 'Untitled'),
        slug: String(row.slug ?? ''),
        body: sanitizeRichText(String(row.body ?? '')),
        status: status as 'DRAFT' | 'PUBLISHED',
        data: rawData
          ? ((regen ? rewriteRefs(rawData, ctx.idMap) : rawData) as Record<string, unknown>)
          : null,
        featuredImage: (row.featuredImage as string) ?? null,
        authorId: ctx.authorId,
      }

      // Duplicating into a populated site: don't collide on the unique slug.
      if (regen) {
        let candidate = values.slug
        let n = 2
        while (candidate && (await Content.query().where('slug', candidate).first())) {
          candidate = `${values.slug}-${n++}`
        }
        values.slug = candidate
      }

      try {
        if (existing) {
          existing.merge(values)
          await existing.save()
          report.updated++
        } else {
          await Content.create({ id: targetId, ...values })
          report.created++
        }
      } catch (e) {
        report.warnings.push(`content "${values.slug}": ${(e as Error).message}`)
      }
    }
    return report
  },
}
