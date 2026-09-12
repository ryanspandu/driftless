/**
 * BullMQ job names + payloads for background site export/import.
 *
 * Payloads are JSON that round-trips through Redis, so they carry only the job
 * row id — the archive bytes live on disk (`storage/imports` / `storage/exports`)
 * and everything else (mode, conflict, only…) is read back from the job row.
 */
export const SITE_IMPORT_JOB = 'site.import'
export const SITE_EXPORT_JOB = 'site.export'

export interface SiteTransferJobPayload {
  jobId: string
}
