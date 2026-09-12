import type { HttpContext } from '@adonisjs/core/http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import TransferJobService from '#services/data_transfer/transfer_job_service'
import type DataTransferJob from '#models/data_transfer_job'
import {
  registeredDataSections,
  type ConflictMode,
  type IdMode,
} from '#services/data_transfer/registry'

/**
 * Admin surface for whole-site export/import. Export and (non-dry-run) import run
 * as BullMQ background jobs tracked by a `data_transfer_jobs` row the page polls;
 * a dry-run import stays synchronous (it only counts rows). Gated by
 * `settings:manage` on the routes.
 */
export default class DataTransferController {
  private jobs = new TransferJobService()

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/settings/data_transfer', {})
  }

  /** The sections available to export right now (core + enabled modules). */
  async manifest({ response }: HttpContext) {
    const enabled = await new ModulesService().enabledMap()
    const sections = registeredDataSections()
      .filter((s) => s.owner === 'core' || enabled.get(s.owner))
      .map((s) => ({ name: s.name, label: s.label ?? s.name, owner: s.owner }))
    return response.json({ sections })
  }

  async exportArchive({ request, auth, response }: HttpContext) {
    try {
      const job = await this.jobs.startExport({
        mode: this.parseMode(request.input('mode')),
        only: this.parseOnly(request.input('only')),
        authorId: auth.user?.id ?? null,
      })
      return response.status(202).json({ jobId: job.id })
    } catch (e) {
      return response.status(this.statusOf(e)).json({ message: (e as Error).message })
    }
  }

  async importArchive({ request, auth, response }: HttpContext) {
    const file = request.file('archive', { size: '200mb' })
    if (!file || !file.tmpPath) {
      return response.status(422).json({ message: 'An `archive` file is required' })
    }
    const dryRun = request.input('dryRun') === 'true' || request.input('dryRun') === true

    // Dry-run only counts rows — cheap, so run it inline and return the preview.
    if (dryRun) {
      const buffer = await readFile(file.tmpPath)
      const { default: SiteImportService } =
        await import('#services/data_transfer/site_import_service')
      try {
        const result = await new SiteImportService().import(buffer, {
          mode: this.parseMode(request.input('mode')),
          conflict: this.parseConflict(request.input('conflict')),
          only: this.parseOnly(request.input('only')),
          dryRun: true,
          authorId: auth.user?.id ?? null,
        })
        return response.json({ dryRun: true, result })
      } catch (e) {
        return response.status(422).json({ message: (e as Error).message })
      }
    }

    // Real import: stage the upload to a stable path a worker can read later,
    // then dispatch a background job.
    try {
      const dir = app.makePath('storage/imports')
      await mkdir(dir, { recursive: true })
      const archivePath = join(dir, `${newUlid()}.driftless`)
      await file.move(dir, { name: archivePath.split('/').pop()!, overwrite: true })

      const job = await this.jobs.startImport({
        archivePath,
        mode: this.parseMode(request.input('mode')),
        conflict: this.parseConflict(request.input('conflict')),
        only: this.parseOnly(request.input('only')),
        authorId: auth.user?.id ?? null,
      })
      return response.status(202).json({ jobId: job.id })
    } catch (e) {
      return response.status(this.statusOf(e)).json({ message: (e as Error).message })
    }
  }

  /** Poll one job's status (unthrottled; polled every couple seconds). */
  async job({ params, response }: HttpContext) {
    const job = await this.jobs.find(params.id)
    if (!job) return response.status(404).json({ message: 'Job not found' })
    return response.json({ job: this.toDto(job) })
  }

  /** The most recent job of a kind, so any admin/tab discovers an in-flight run. */
  async latestJob({ params, response }: HttpContext) {
    const kind = params.kind === 'export' ? 'export' : 'import'
    const job = await this.jobs.latest(kind)
    return response.json({ job: job ? this.toDto(job) : null })
  }

  /** Stream a finished export archive. */
  async downloadExport({ params, response }: HttpContext) {
    const job = await this.jobs.find(params.id)
    if (!job || job.kind !== 'export') return response.status(404).json({ message: 'Not found' })
    if (job.state !== 'succeeded' || !job.downloadPath || !existsSync(job.downloadPath)) {
      return response.status(409).json({ message: 'Export is not ready' })
    }
    return response.download(job.downloadPath)
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private toDto(job: DataTransferJob) {
    const filename =
      job.kind === 'export' ? ((job.result?.filename as string | undefined) ?? null) : null
    return {
      id: job.id,
      kind: job.kind,
      state: job.state,
      total: job.total,
      completed: job.completed,
      currentSection: job.currentSection,
      logTail: job.logTail,
      errorMessage: job.errorMessage,
      result: job.result,
      dryRun: job.dryRun,
      mode: job.mode,
      conflict: job.conflict,
      downloadReady: job.kind === 'export' && job.state === 'succeeded' && !!job.downloadPath,
      downloadName: filename,
      startedAt: job.startedAt?.toISO() ?? null,
      finishedAt: job.finishedAt?.toISO() ?? null,
    }
  }

  private parseMode(raw: unknown): IdMode | undefined {
    return raw === 'regenerate' ? 'regenerate' : raw === 'preserve' ? 'preserve' : undefined
  }

  private parseConflict(raw: unknown): ConflictMode | undefined {
    const v = String(raw ?? '')
    return (['overwrite', 'skip', 'replace'] as ConflictMode[]).includes(v as ConflictMode)
      ? (v as ConflictMode)
      : undefined
  }

  private parseOnly(raw: unknown): string[] | undefined {
    if (Array.isArray(raw)) return (raw as string[]).filter(Boolean)
    if (typeof raw === 'string' && raw) return raw.split(',').filter(Boolean)
    return undefined
  }

  /** A PublicError carries its own status (e.g. 409 conflict); default 422. */
  private statusOf(e: unknown): number {
    const status = (e as { status?: number })?.status
    return typeof status === 'number' ? status : 422
  }
}
