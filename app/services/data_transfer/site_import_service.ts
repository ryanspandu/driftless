import db from '@adonisjs/lucid/services/db'
import ModulesService from '#services/modules_service'
import {
  countRows,
  getDataSection,
  registeredDataSections,
  type ConflictMode,
  type DataSection,
  type IdMode,
  type ImportCtx,
  type SectionReport,
  type TransferProgress,
} from './registry.js'
import { parseManifest } from './manifest.js'
import { readArchive } from './bundle.js'

export interface ImportOptions {
  mode?: IdMode
  conflict?: ConflictMode
  authorId?: number | null
  only?: string[]
  dryRun?: boolean
  /** Called at the start + end of each section so a job row can show progress. */
  onProgress?: (p: TransferProgress) => void | Promise<void>
  /** Called for each live log line (mirrors the returned `log`). */
  onLog?: (line: string) => void | Promise<void>
}

export interface ImportResult {
  dryRun: boolean
  mode: IdMode
  conflict: ConflictMode
  sections: SectionReport[]
  skipped: Array<{ name: string; reason: string }>
  log: string[]
}

/**
 * Restore a `.driftless` archive. Sections run in registry order (dependency
 * order), never in the arbitrary order they appear in the file. A section whose
 * owner module is disabled — or absent from this build entirely — is reported
 * as skipped, never a crash.
 */
export default class SiteImportService {
  async import(archive: Buffer, opts: ImportOptions = {}): Promise<ImportResult> {
    const files = await readArchive(archive)
    const manifestBuf = files.get('manifest.json')
    if (!manifestBuf) throw new Error('Invalid archive: no manifest.json')
    const manifest = parseManifest(JSON.parse(manifestBuf.toString('utf8')))

    const mode: IdMode = opts.mode ?? manifest.idMode ?? 'preserve'
    const conflict: ConflictMode = opts.conflict ?? 'overwrite'
    const only = opts.only && opts.only.length > 0 ? new Set(opts.only) : null
    const enabled = await new ModulesService().enabledMap()

    const log: string[] = []
    const pushLog = (line: string) => {
      log.push(line)
      void opts.onLog?.(line)
    }
    const skipped: Array<{ name: string; reason: string }> = []
    const reports: SectionReport[] = []
    const idMap = new Map<string, string>()

    // Report manifest sections this build can't handle (module not installed).
    for (const ms of manifest.sections) {
      if (!getDataSection(ms.name)) {
        skipped.push({ name: ms.name, reason: 'no importer registered (module not installed)' })
      }
    }

    // Run registered sections in dependency order, restricted to those present.
    const present = new Set(manifest.sections.map((s) => s.name))
    const willRun = (section: DataSection) =>
      present.has(section.name) &&
      (!only || only.has(section.name)) &&
      (section.owner === 'core' || !!enabled.get(section.owner))

    // Denominator for progress: sections that will actually import (present +
    // selected + enabled + carry a payload). Dry-run does no work, so 0.
    const total = opts.dryRun
      ? 0
      : registeredDataSections().filter((s) => willRun(s) && files.has(`sections/${s.name}.json`))
          .length
    let completed = 0

    // conflict:'replace' — wipe each selected section's tables first, in reverse
    // dependency order (child sections + child tables before their parents) so
    // FKs don't block the delete. Best-effort: dynamic collection tables and
    // cross-module FKs may not fully clear, so a delete failure is tolerated.
    if (conflict === 'replace' && !opts.dryRun) {
      const runList = registeredDataSections().filter(willRun)
      for (const section of [...runList].reverse()) {
        for (const table of [...(section.tables ?? [])].reverse()) {
          try {
            await db.from(table).delete()
          } catch {
            /* FK or missing table — a later section's delete clears the referrer */
          }
        }
      }
    }

    for (const section of registeredDataSections()) {
      if (!present.has(section.name)) continue
      if (only && !only.has(section.name)) continue
      if (section.owner !== 'core' && !enabled.get(section.owner)) {
        skipped.push({ name: section.name, reason: `module "${section.owner}" is not enabled` })
        continue
      }

      const buf = files.get(`sections/${section.name}.json`)
      if (!buf) continue
      const data = JSON.parse(buf.toString('utf8'))

      const label = section.label ?? section.name

      if (opts.dryRun) {
        const count = countRows(data)
        pushLog(`[dry-run] would import ${count} ${count === 1 ? 'row' : 'rows'} → ${label}`)
        continue
      }

      await opts.onProgress?.({ completed, total, section: label, phase: 'start' })

      const ctx: ImportCtx = {
        mode,
        conflict,
        idMap,
        resolveMediaRef: () => null,
        authorId: opts.authorId ?? null,
        getFile: (name) => files.get(name),
        log: (line) => pushLog(line),
      }
      const report = await section.import(ctx, data)
      reports.push(report)
      pushLog(
        `${section.name}: +${report.created} created, ~${report.updated} updated, ${report.skipped} skipped`
      )
      completed++
      await opts.onProgress?.({ completed, total, section: label, phase: 'done' })
    }

    return { dryRun: !!opts.dryRun, mode, conflict, sections: reports, skipped, log }
  }
}
