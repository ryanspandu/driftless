import Form from '#models/form'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Builder form DEFINITIONS (`forms`): slug, title, the JSON `fields` schema,
 * success message and status. Forms are referenced by their stable `slug` (the
 * submit payload's `form` key and the FormBlock), never by id, so import upserts
 * by slug and needs no reference rewriting. Submissions/uploads are separate
 * (opt-in) — a fresh target starts with an empty inbox.
 */
export const formsSection: DataSection = {
  name: 'forms',
  owner: 'core',
  order: 58,
  label: 'Forms',
  tables: ['forms'],

  async export() {
    const forms = await Form.query().orderBy('created_at', 'asc')
    return {
      forms: forms.map((f) => ({
        id: f.id,
        slug: f.slug,
        title: f.title,
        fields: f.fields,
        successMessage: f.successMessage,
        status: f.status,
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('forms')
    const payload = (data ?? {}) as { forms?: Array<Record<string, unknown>> }
    const regen = ctx.mode === 'regenerate'
    for (const f of payload.forms ?? []) {
      const slug = String(f.slug ?? '')
      if (!slug) continue
      try {
        const existing = await Form.findBy('slug', slug)
        const values = {
          slug,
          title: String(f.title ?? slug),
          fields: (f.fields ?? []) as never,
          successMessage: (f.successMessage as string) ?? null,
          status: String(f.status ?? 'active') as 'active' | 'inactive' | 'draft',
        }
        if (existing) {
          if (ctx.conflict === 'skip') {
            report.skipped++
            continue
          }
          existing.merge(values)
          await existing.save()
          report.updated++
        } else {
          const id = regen ? newUlid() : String(f.id ?? '') || newUlid()
          await Form.create({ id, ...values })
          report.created++
        }
      } catch (e) {
        report.warnings.push(`form "${slug}": ${(e as Error).message}`)
      }
    }
    return report
  },
}
