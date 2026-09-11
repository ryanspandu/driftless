import type { MultipartFile } from '@adonisjs/core/bodyparser'
import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import { existsSync, mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileTypeFromFile } from 'file-type'
import Form from '#models/form'
import FormUpload from '#models/form_upload'
import { newUlid } from '#services/ulid_service'

/**
 * Files attached to form submissions.
 *
 * Anonymous upload is a real attack surface, so this is deliberately strict and
 * isolated: an allow-list checked by **magic bytes** (never the client's
 * MIME/extension), a size cap, an isolated store, an opaque token (no guessable
 * URL), and admin-only serving. A `store` mints an unbound row; `bind` attaches
 * it to a submission at submit time; unbound rows are garbage-collected.
 */

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

/** mime → extension, allow-listed. Only types with reliable magic bytes. */
const ALLOWED = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
])

export class FormUploadError extends Error {}

export interface FormUploadResult {
  token: string
  filename: string
  size: number
}

export default class FormUploadService {
  private get dir(): string {
    const dir = app.makePath('storage/form_uploads')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  /** Validate + store one uploaded file, returning its opaque token. */
  async store(file: MultipartFile, formSlug?: string): Promise<FormUploadResult> {
    if (!file.isValid || !file.tmpPath) throw new FormUploadError('That file could not be read.')
    if ((file.size ?? 0) > MAX_SIZE) throw new FormUploadError('That file is too large (max 10 MB).')

    // Trust the bytes, not the name: detect the real type and check the allow-list.
    const detected = await fileTypeFromFile(file.tmpPath)
    const ext = detected ? ALLOWED.get(detected.mime) : undefined
    if (!detected || !ext) {
      await rm(file.tmpPath, { force: true }).catch(() => {})
      throw new FormUploadError('That file type is not allowed.')
    }

    const token = newUlid()
    const storedName = `${token}.${ext}`
    await file.move(this.dir, { name: storedName, overwrite: false })

    const formId = formSlug ? ((await Form.query().where('slug', formSlug).first())?.id ?? null) : null
    await FormUpload.create({
      id: token,
      formId,
      submissionId: null,
      filename: (file.clientName || `file.${ext}`).slice(0, 255),
      storedName,
      mime: detected.mime,
      size: file.size ?? 0,
    })

    return { token, filename: file.clientName || storedName, size: file.size ?? 0 }
  }

  /** Attach an uploaded file to a submission. Only an existing, unbound token binds. */
  async bind(token: string, submissionId: string): Promise<boolean> {
    const row = await FormUpload.query().where('id', token).whereNull('submission_id').first()
    if (!row) return false
    row.submissionId = submissionId
    await row.save()
    return true
  }

  /** The stored file for a token, for admin serving. */
  async find(token: string): Promise<{ path: string; filename: string; mime: string } | null> {
    const row = await FormUpload.find(token)
    if (!row) return null
    return { path: join(this.dir, row.storedName), filename: row.filename, mime: row.mime }
  }

  /** Delete every file bound to a submission (called when the submission is deleted). */
  async deleteForSubmission(submissionId: string): Promise<void> {
    const rows = await FormUpload.query().where('submission_id', submissionId)
    for (const row of rows) {
      await rm(join(this.dir, row.storedName), { force: true }).catch(() => {})
    }
    await FormUpload.query().where('submission_id', submissionId).delete()
  }

  /** Drop uploads never bound to a submission after `hours` (an abandoned/attack upload). */
  async gcOrphans(hours = 24): Promise<number> {
    const cutoff = DateTime.now().minus({ hours }).toSQL()!
    const rows = await FormUpload.query()
      .whereNull('submission_id')
      .where('created_at', '<', cutoff)
    for (const row of rows) {
      await rm(join(this.dir, row.storedName), { force: true }).catch(() => {})
    }
    const ids = rows.map((r) => r.id)
    if (ids.length) await FormUpload.query().whereIn('id', ids).delete()
    return ids.length
  }
}
