import crypto from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { newUlid } from '#services/ulid_service'
import FormSubmission from '#models/form_submission'
import Form from '#models/form'
import { validateSubmission, type FormFieldDef } from '#services/form_schema'
import FormUploadService from '#services/form_upload_service'
import { WebSettingsService } from '#services/settings_service'

/** The hidden field a bot fills in. A real user never sees or touches it. */
export const HONEYPOT_FIELD = '_hp_url'

const MAX_FIELDS = 40
const MAX_NAME_LEN = 100
const MAX_VALUE_LEN = 5_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const web = new WebSettingsService()
const uploads = new FormUploadService()

/**
 * A defined form rejected the submission on validation (missing required, bad
 * type, invalid choice). Distinct from an infra failure so the controller can
 * answer 422-with-errors instead of the swallow-to-200 path.
 */
export class FormValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super('Form validation failed')
  }
}

/** The sender email: the defined `email` field's value, else a field named `email`. */
function extractEmail(fields: FormFieldDef[] | null, data: Record<string, unknown>): string | null {
  const emailField = fields?.find((f) => f.type === 'email')
  const raw = String((emailField ? data[emailField.key] : data.email) ?? '').trim()
  return EMAIL_RE.test(raw) ? raw.slice(0, 254) : null
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

/** Keep only clean, capped, non-internal fields. */
function sanitiseFields(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  let count = 0
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_FIELDS) break
    if (!key || key.startsWith('_')) continue // internal / honeypot fields dropped
    const name = key.slice(0, MAX_NAME_LEN)
    out[name] = String(value ?? '').slice(0, MAX_VALUE_LEN)
    count++
  }
  return out
}

export interface FormSubmissionDto {
  id: string
  formName: string
  formId: string | null
  pagePath: string | null
  data: Record<string, unknown>
  email: string | null
  status: 'new' | 'read' | 'spam'
  createdAt: string
}

export default class FormSubmissionService {
  /**
   * Record a submission. A filled honeypot lands it in `spam` (still stored, so
   * false positives are recoverable) and skips notifications. Never throws in a
   * way that would fail the visitor's request.
   */
  async record(
    ctx: HttpContext,
    input: { form?: string; page?: string | null; fields: unknown }
  ): Promise<FormSubmission> {
    const raw = (input.fields ?? {}) as Record<string, unknown>
    const isSpam = Boolean(String(raw[HONEYPOT_FIELD] ?? '').trim())

    // A submission whose `form` matches an active definition is validated +
    // whitelisted against its schema; anything else keeps the legacy accept-all
    // path so free-text builder forms (and their tests) still work.
    const def = input.form
      ? await Form.query().where('slug', input.form).where('status', 'active').first()
      : null

    let data: Record<string, unknown>
    let formName: string
    let formId: string | null = null

    if (def) {
      const result = validateSubmission(def.fields, raw)
      // Real validation errors surface to the visitor (422). A honeypot hit still
      // looks like success and is quietly filed as spam.
      if (!isSpam && Object.keys(result.errors).length) throw new FormValidationError(result.errors)
      data = result.data
      formName = def.title.slice(0, 200)
      formId = def.id
    } else {
      data = sanitiseFields(raw)
      formName = (input.form || 'Form').slice(0, 200)
    }

    const submission = await FormSubmission.create({
      id: newUlid(),
      formName,
      formId,
      pagePath: input.page ? String(input.page).slice(0, 512) : null,
      data,
      email: extractEmail(def?.fields ?? null, data),
      ipHash: hashIp(ctx.request.ip()),
      userAgent: ctx.request.header('user-agent')?.slice(0, 512) ?? null,
      status: isSpam ? 'spam' : 'new',
    })

    // Attach any uploaded files to this submission (defined forms only — the
    // file field's value is the upload token minted by `/api/forms/upload`).
    if (def) {
      for (const field of def.fields) {
        const token = field.type === 'file' ? data[field.key] : null
        if (typeof token === 'string' && token) await uploads.bind(token, submission.id)
      }
    }

    if (!isSpam) void this.notify(submission)
    return submission
  }

  /** Fire the configured webhook (fire-and-forget; never blocks the response). */
  private async notify(submission: FormSubmission): Promise<void> {
    try {
      const { webhookUrl } = await web.getFormsConfig()
      if (!webhookUrl) return
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form: submission.formName,
          page: submission.pagePath,
          email: submission.email,
          data: submission.data,
          at: submission.createdAt?.toISO(),
        }),
        signal: AbortSignal.timeout(5_000),
      })
    } catch {
      // A broken webhook must never lose the submission — it is already stored.
    }
  }

  async list(
    filter: { status?: 'new' | 'read' | 'spam'; form?: string; formId?: string } = {}
  ): Promise<{ items: FormSubmissionDto[]; unread: number }> {
    const query = FormSubmission.query().orderBy('created_at', 'desc').limit(500)
    if (filter.status) query.where('status', filter.status)
    if (filter.form) query.where('form_name', filter.form)
    if (filter.formId) query.where('form_id', filter.formId)
    const rows = await query

    // Unread count is scoped the same way as the list (per-form when filtered).
    const unreadQuery = FormSubmission.query().where('status', 'new')
    if (filter.formId) unreadQuery.where('form_id', filter.formId)
    const unreadRow = await unreadQuery.count('* as total').first()

    return {
      items: rows.map((r) => this.toDto(r)),
      unread: Number(unreadRow?.$extras.total ?? 0),
    }
  }

  async updateStatus(id: string, status: 'new' | 'read' | 'spam'): Promise<FormSubmissionDto> {
    const row = await FormSubmission.findOrFail(id)
    row.status = status
    await row.save()
    return this.toDto(row)
  }

  async delete(id: string): Promise<void> {
    // Remove any attached files first, then the row.
    await uploads.deleteForSubmission(id)
    await FormSubmission.query().where('id', id).delete()
  }

  private toDto(row: FormSubmission): FormSubmissionDto {
    return {
      id: row.id,
      formName: row.formName,
      formId: row.formId,
      pagePath: row.pagePath,
      data: row.data,
      email: row.email,
      status: row.status,
      createdAt: row.createdAt.toISO()!,
    }
  }
}
