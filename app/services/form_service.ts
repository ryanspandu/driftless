import Form from '#models/form'
import FormSubmission from '#models/form_submission'
import { newUlid } from '#services/ulid_service'
import { sanitiseFormDefinition, type FormFieldDef } from '#services/form_schema'

/**
 * CRUD for named form definitions. Submissions live in `form_submissions`; this
 * owns only the definition (`slug`, `title`, `fields`, `status`). A form backs no
 * SQL columns, so there is no DDL here — `fields` is validated JSON.
 */

export interface FormSummaryDto {
  id: string
  slug: string
  title: string
  status: 'active' | 'inactive' | 'draft'
  fieldCount: number
  submissionCount: number
  createdAt: string
  updatedAt: string
}

export interface FormDefinitionDto {
  id: string
  slug: string
  title: string
  fields: FormFieldDef[]
  successMessage: string | null
  status: 'active' | 'inactive' | 'draft'
  submissionCount: number
  createdAt: string
  updatedAt: string
}

const STATUSES = ['active', 'inactive', 'draft'] as const

function slugify(input: string): string {
  const s = String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return s || 'form'
}

export default class FormService {
  async list(): Promise<FormSummaryDto[]> {
    const forms = await Form.query().orderBy('updated_at', 'desc')
    const counts = await this.countsByForm()
    return forms.map((f) => this.toSummary(f, counts.get(f.id) ?? 0))
  }

  async get(id: string): Promise<FormDefinitionDto> {
    const form = await Form.findOrFail(id)
    return this.toDto(form, await this.count(form.id))
  }

  async create(body: { title?: unknown; slug?: unknown }): Promise<FormDefinitionDto> {
    const title = String(body.title ?? '').trim()
    if (!title) throw new Error('A title is required')
    const slug = await this.uniqueSlug(body.slug ? String(body.slug) : title)
    const form = await Form.create({
      id: newUlid(),
      slug,
      title: title.slice(0, 200),
      fields: [],
      successMessage: null,
      status: 'active',
    })
    return this.toDto(form, 0)
  }

  async update(
    id: string,
    body: {
      title?: unknown
      slug?: unknown
      successMessage?: unknown
      status?: unknown
      fields?: unknown
    }
  ): Promise<FormDefinitionDto> {
    const form = await Form.findOrFail(id)
    if (body.title !== undefined) {
      const t = String(body.title).trim()
      if (!t) throw new Error('A title is required')
      form.title = t.slice(0, 200)
    }
    if (body.slug !== undefined) form.slug = await this.uniqueSlug(String(body.slug), form.id)
    if (body.successMessage !== undefined) {
      const m = body.successMessage == null ? '' : String(body.successMessage).trim()
      form.successMessage = m ? m.slice(0, 500) : null
    }
    if (body.status !== undefined && STATUSES.includes(body.status as never)) {
      form.status = body.status as Form['status']
    }
    // sanitiseFormDefinition throws on a structurally invalid schema (bad key,
    // unknown type, missing options) — the controller turns that into a 422.
    if (body.fields !== undefined) form.fields = sanitiseFormDefinition(body.fields)
    await form.save()
    return this.toDto(form, await this.count(form.id))
  }

  /** Delete the definition. Submissions are kept (they remain in the global inbox). */
  async delete(id: string): Promise<void> {
    await Form.query().where('id', id).delete()
  }

  async duplicate(id: string): Promise<FormDefinitionDto> {
    const src = await Form.findOrFail(id)
    const form = await Form.create({
      id: newUlid(),
      slug: await this.uniqueSlug(`${src.slug}-copy`),
      title: `${src.title} (copy)`.slice(0, 200),
      fields: src.fields,
      successMessage: src.successMessage,
      status: 'draft',
    })
    return this.toDto(form, 0)
  }

  private async countsByForm(): Promise<Map<string, number>> {
    const rows = await FormSubmission.query()
      .whereNotNull('form_id')
      .groupBy('form_id')
      .count('* as total')
      .select('form_id')
    return new Map(rows.map((r) => [r.formId as string, Number(r.$extras.total ?? 0)]))
  }

  private async count(formId: string): Promise<number> {
    const row = await FormSubmission.query().where('form_id', formId).count('* as total').first()
    return Number(row?.$extras.total ?? 0)
  }

  /** A slug unique across forms, appending `-2`, `-3`, … on collision. */
  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base)
    let candidate = root
    let n = 1
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const q = Form.query().where('slug', candidate)
      if (excludeId) q.whereNot('id', excludeId)
      const clash = await q.first()
      if (!clash) return candidate
      n += 1
      candidate = `${root}-${n}`.slice(0, 120)
    }
  }

  private toSummary(form: Form, submissionCount: number): FormSummaryDto {
    return {
      id: form.id,
      slug: form.slug,
      title: form.title,
      status: form.status,
      fieldCount: form.fields.length,
      submissionCount,
      createdAt: form.createdAt.toISO()!,
      updatedAt: form.updatedAt.toISO()!,
    }
  }

  private toDto(form: Form, submissionCount: number): FormDefinitionDto {
    return {
      id: form.id,
      slug: form.slug,
      title: form.title,
      fields: form.fields,
      successMessage: form.successMessage,
      status: form.status,
      submissionCount,
      createdAt: form.createdAt.toISO()!,
      updatedAt: form.updatedAt.toISO()!,
    }
  }
}
