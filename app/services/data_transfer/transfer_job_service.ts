import { DateTime } from 'luxon'
import { mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import { enqueue, hasWorker } from '#services/queue/registry'
import DataTransferJob, { type DataTransferKind } from '#models/data_transfer_job'
import { SITE_IMPORT_JOB, SITE_EXPORT_JOB } from '#services/data_transfer/transfer_jobs'
import type { ConflictMode, IdMode, TransferProgress } from '#services/data_transfer/registry'

/** Keep the log bounded — enough to diagnose, not the whole run. */
const LOG_TAIL_MAX = 300

/** A job untouched for this long is treated as dead (worker crashed mid-run). */
const STALE_MS = 2 * 60 * 1000

export interface StartImportInput {
  archivePath: string
  mode?: IdMode
  conflict?: ConflictMode
  only?: string[]
  dryRun?: boolean
  authorId?: number | null
}

export interface StartExportInput {
  mode?: IdMode
  only?: string[]
  authorId?: number | null
}

/**
 * Orchestrates background site export/import as a status row the admin polls.
 *
 * The row IS the state (like `module_install_job_service`, minus the spawn/restart
 * dance — an import/export only touches DB rows + files already-loaded code can
 * read, so it runs on the BullMQ worker). When no worker/Redis is available
 * `enqueue` returns false and we run the job INLINE so the feature still works
 * (this is also the path tests take, since `QUEUE_ENABLED=false`).
 */
export default class TransferJobService {
  private exportsDir = () => app.makePath('storage/exports')

  // ── Public: start (from the controller) ────────────────────────────────────

  async startImport(input: StartImportInput): Promise<DataTransferJob> {
    const job = await this.create('import', {
      archivePath: input.archivePath,
      mode: input.mode ?? null,
      conflict: input.conflict ?? null,
      only: input.only ?? [],
      dryRun: input.dryRun ?? false,
      authorId: input.authorId ?? null,
    })

    // Only hand off to the queue when a worker is actually listening — otherwise
    // the job would sit `queued` forever (e.g. `npm run worker` not running).
    const queued = (await hasWorker()) && (await enqueue(SITE_IMPORT_JOB, { jobId: job.id }))
    if (!queued) await this.runImport(job.id)
    return job.refresh().then(() => job)
  }

  async startExport(input: StartExportInput): Promise<DataTransferJob> {
    // Keep only the latest export archive on disk.
    await this.clearDir(this.exportsDir())

    const job = await this.create('export', {
      mode: input.mode ?? null,
      only: input.only ?? [],
      authorId: input.authorId ?? null,
    })

    const queued = await enqueue(SITE_EXPORT_JOB, { jobId: job.id })
    if (!queued) await this.runExport(job.id)
    return job.refresh().then(() => job)
  }

  // ── Public: run (from the worker handler, or inline fallback) ───────────────

  async runImport(jobId: string): Promise<void> {
    const job = await DataTransferJob.find(jobId)
    if (!job || job.state !== 'queued') return // idempotent: already running/done
    await this.markRunning(job)

    const { default: SiteImportService } =
      await import('#services/data_transfer/site_import_service')
    try {
      const buffer = await readFile(job.archivePath!)
      const result = await new SiteImportService().import(buffer, {
        mode: (job.mode ?? undefined) as IdMode | undefined,
        conflict: (job.conflict ?? undefined) as ConflictMode | undefined,
        only: job.only.length ? job.only : undefined,
        dryRun: job.dryRun,
        authorId: job.authorId,
        onProgress: (p) => this.onProgress(job, p),
        onLog: (line) => this.appendLog(job, line),
      })
      await this.markSucceeded(job, result as unknown as Record<string, unknown>)
    } catch (e) {
      await this.markFailed(job, (e as Error).message)
    } finally {
      // The staged upload is consumed — drop it whatever the outcome.
      if (job.archivePath) await rm(job.archivePath, { force: true })
    }
  }

  async runExport(jobId: string): Promise<void> {
    const job = await DataTransferJob.find(jobId)
    if (!job || job.state !== 'queued') return
    await this.markRunning(job)

    const { default: SiteExportService } =
      await import('#services/data_transfer/site_export_service')
    try {
      const buffer = await new SiteExportService().export({
        mode: (job.mode ?? undefined) as IdMode | undefined,
        only: job.only.length ? job.only : undefined,
        onProgress: (p) => this.onProgress(job, p),
      })
      await mkdir(this.exportsDir(), { recursive: true })
      const filename = `site-${DateTime.now().toFormat('yyyy-LL-dd')}-${job.id.slice(-6)}.driftless`
      const path = join(this.exportsDir(), filename)
      await writeFile(path, buffer)
      job.downloadPath = path
      await this.markSucceeded(job, { filename, size: buffer.length })
    } catch (e) {
      await this.markFailed(job, (e as Error).message)
    }
  }

  // ── Reads (for the polling endpoint) ────────────────────────────────────────

  find(id: string) {
    return DataTransferJob.find(id)
  }

  latest(kind: DataTransferKind) {
    return DataTransferJob.query().where('kind', kind).orderBy('created_at', 'desc').first()
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async create(
    kind: DataTransferKind,
    fields: Partial<DataTransferJob>
  ): Promise<DataTransferJob> {
    // Fast-path conflict check; the unique `active_lock` index is the real guard.
    const active = await DataTransferJob.query()
      .where('kind', kind)
      .whereNotNull('active_lock')
      .first()
    if (active) {
      // Reclaim a job that can never finish — one stuck `queued` with no worker to
      // pick it up, or any job untouched past the stale window (crashed mid-run) —
      // so the operator is never blocked forever by a dead run.
      if (await this.isStale(active)) {
        await this.markAbandoned(active)
      } else {
        throw publicError.conflict(`An ${kind} is already running`, 'transfer_in_progress')
      }
    }
    try {
      return await DataTransferJob.create({
        id: newUlid(),
        kind,
        state: 'queued',
        activeLock: kind,
        total: 0,
        completed: 0,
        logTail: [],
        ...fields,
      })
    } catch {
      // Lost the race against the unique index.
      throw publicError.conflict(`An ${kind} is already running`, 'transfer_in_progress')
    }
  }

  private async markRunning(job: DataTransferJob): Promise<void> {
    job.state = 'running'
    job.startedAt = DateTime.now()
    await job.save()
  }

  private async onProgress(job: DataTransferJob, p: TransferProgress): Promise<void> {
    job.total = p.total
    job.completed = p.completed
    job.currentSection = p.section
    await job.save()
  }

  private async appendLog(job: DataTransferJob, line: string): Promise<void> {
    job.logTail = [...job.logTail, line].slice(-LOG_TAIL_MAX)
    await job.save()
  }

  private async markSucceeded(
    job: DataTransferJob,
    result: Record<string, unknown>
  ): Promise<void> {
    job.state = 'succeeded'
    job.result = result
    if (job.total > 0) job.completed = job.total
    job.currentSection = null
    job.activeLock = null
    job.finishedAt = DateTime.now()
    await job.save()
  }

  private async markFailed(job: DataTransferJob, message: string): Promise<void> {
    job.state = 'failed'
    job.errorMessage = message
    job.currentSection = null
    job.activeLock = null
    job.finishedAt = DateTime.now()
    await job.save()
  }

  /** A job that cannot still be progressing: stuck `queued` with no worker, or stale. */
  private async isStale(job: DataTransferJob): Promise<boolean> {
    if (Date.now() - job.updatedAt.toMillis() > STALE_MS) return true
    if (job.state === 'queued' && !(await hasWorker())) return true
    return false
  }

  private async markAbandoned(job: DataTransferJob): Promise<void> {
    job.state = 'failed'
    job.errorMessage =
      job.errorMessage ?? 'Abandoned — no worker processed it, or the run was interrupted.'
    job.currentSection = null
    job.activeLock = null
    job.finishedAt = DateTime.now()
    await job.save()
  }

  /** Best-effort: remove every file in a dir (keep-latest for exports). */
  private async clearDir(dir: string): Promise<void> {
    try {
      const names = await readdir(dir)
      await Promise.all(names.map((n) => rm(join(dir, n), { force: true })))
    } catch {
      // Dir doesn't exist yet — nothing to clear.
    }
  }
}
