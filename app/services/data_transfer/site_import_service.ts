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
    // Re-read after the `modules` section runs (it can enable a module whose
    // own section imports later in this same run).
    let enabled = await new ModulesService().enabledMap()
    // The archive carrying a `modules` section means module enable-state will be
    // applied mid-run, so a module-owned section may become runnable even though
    // it's disabled right now — count it toward progress and let it run.
    const archiveEnablesModules = manifest.sections.some((s) => s.name === 'modules')
    const ownerMayRun = (owner: string) => enabled.get(owner) || archiveEnablesModules

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
      (section.owner === 'core' || ownerMayRun(section.owner))

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
          // Never wipe `users`: it holds the admin performing this import (the
          // author FK stamped on incoming content). The users section upserts by
          // email, so a replace still reconciles it without orphaning the admin.
          if (table === 'users') continue
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
      // Gate module-owned sections on the CURRENT enable-state (the `modules`
      // section, order 5, may have flipped it earlier in this loop).
      if (section.owner !== 'core' && !enabled.get(section.owner)) {
        skipped.push({ name: section.name, reason: `module "${section.owner}" is not enabled` })
        continue
      }

      const buf = files.get(`sections/${section.name}.json`)
      if (!buf) continue
      const data = JSON.parse(buf.toString('utf8'))

      const label = section.label ?? section.name

      const ctx: ImportCtx = {
        mode,
        conflict,
        idMap,
        resolveMediaRef: () => null,
        authorId: opts.authorId ?? null,
        getFile: (name) => files.get(name),
        log: (line) => pushLog(line),
      }

      if (opts.dryRun) {
        const count = countRows(data)
        pushLog(`[dry-run] would import ${count} ${count === 1 ? 'row' : 'rows'} → ${label}`)
        // A dry run never runs `import`, so it cannot hit the validators that an
        // import would — ask the section what it would trip over (read-only).
        if (section.preflight) {
          try {
            for (const warning of await section.preflight(ctx, data)) {
              pushLog(`[dry-run] warning (${section.name}): ${warning}`)
            }
          } catch (e) {
            pushLog(
              `[dry-run] warning (${section.name}): preflight failed — ${(e as Error).message}`
            )
          }
        }
        continue
      }

      await opts.onProgress?.({ completed, total, section: label, phase: 'start' })

      // Isolate each section: one section's failure (a bad row, an unexpected FK)
      // must not abort the rest of the migration — record it and carry on, so a
      // late section (e.g. settings, order 70) always runs.
      try {
        const report = await section.import(ctx, data)
        reports.push(report)
        pushLog(
          `${section.name}: +${report.created} created, ~${report.updated} updated, ${report.skipped} skipped`
        )
        // A section that recovers from a problem reports it as a warning. Those
        // used to be visible only in the JSON result — surface them in the log
        // the operator actually reads.
        for (const warning of report.warnings) pushLog(`⚠ ${section.name}: ${warning}`)
      } catch (e) {
        const msg = (e as Error).message
        reports.push({ name: section.name, created: 0, updated: 0, skipped: 0, warnings: [msg] })
        pushLog(`✗ ${section.name} failed: ${msg} — continuing with the remaining sections`)
      }

      // The `modules` section (order 5) restores which modules are enabled; pick
      // that up so module-owned sections later in this loop are gated correctly.
      if (section.name === 'modules') {
        enabled = await new ModulesService().enabledMap()
      }

      completed++
      await opts.onProgress?.({ completed, total, section: label, phase: 'done' })
    }

    return { dryRun: !!opts.dryRun, mode, conflict, sections: reports, skipped, log }
  }
}
