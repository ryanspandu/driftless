import crypto from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { newUlid } from '#services/ulid_service'
import FormSubmission from '#models/form_submission'
import { WebSettingsService } from '#services/settings_service'

/** The hidden field a bot fills in. A real user never sees or touches it. */
export const HONEYPOT_FIELD = '_hp_url'

const MAX_FIELDS = 40
const MAX_NAME_LEN = 100
const MAX_VALUE_LEN = 5_000

const web = new WebSettingsService()

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
    const data = sanitiseFields(raw)

    const emailRaw = String(data.email ?? '').trim()
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.slice(0, 254) : null

    const submission = await FormSubmission.create({
      id: newUlid(),
      formName: (input.form || 'Form').slice(0, 200),
      pagePath: input.page ? String(input.page).slice(0, 512) : null,
      data,
      email,
      ipHash: hashIp(ctx.request.ip()),
      userAgent: ctx.request.header('user-agent')?.slice(0, 512) ?? null,
      status: isSpam ? 'spam' : 'new',
    })

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

  async list(filter: { status?: 'new' | 'read' | 'spam'; form?: string } = {}): Promise<{
    items: FormSubmissionDto[]
    unread: number
  }> {
    const query = FormSubmission.query().orderBy('created_at', 'desc').limit(500)
    if (filter.status) query.where('status', filter.status)
    if (filter.form) query.where('form_name', filter.form)
    const rows = await query

    const unreadRow = await FormSubmission.query()
      .where('status', 'new')
      .count('* as total')
      .first()

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
    await FormSubmission.query().where('id', id).delete()
  }

  private toDto(row: FormSubmission): FormSubmissionDto {
    return {
      id: row.id,
      formName: row.formName,
      pagePath: row.pagePath,
      data: row.data,
      email: row.email,
      status: row.status,
      createdAt: row.createdAt.toISO()!,
    }
  }
}
