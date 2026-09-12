import { CMS_VERSION } from '#cms_version'
import ModulesService from '#services/modules_service'
import {
  countRows,
  registeredDataSections,
  type ExportCtx,
  type IdMode,
  type MediaRefInput,
  type TransferProgress,
} from './registry.js'
import { ARCHIVE_TYPE, FORMAT_VERSION, type Manifest, type ManifestSection } from './manifest.js'
import { packArchive, type ArchiveFile } from './bundle.js'

export interface ExportOptions {
  /** Restrict to these section names; empty/undefined = every eligible section. */
  only?: string[]
  mode?: IdMode
  /** Called at the start + end of each exported section so a job row can show progress. */
  onProgress?: (p: TransferProgress) => void | Promise<void>
}

/**
 * Serialize the whole site into a `.driftless` archive. Runs every registered
 * section whose owner module is currently enabled (core is always run),
 * filtered by `only`, and writes one `sections/<name>.json` per non-empty
 * section plus a `manifest.json` envelope.
 */
export default class SiteExportService {
  async export(opts: ExportOptions = {}): Promise<Buffer> {
    const mode: IdMode = opts.mode ?? 'preserve'
    const only = opts.only && opts.only.length > 0 ? new Set(opts.only) : null
    const enabled = await new ModulesService().enabledMap()

    const mediaFiles = new Map<string, Buffer>()
    const ctx: ExportCtx = {
      mode,
      selected: only ?? new Set<string>(),
      isSelected: (key) => !only || only.has(key),
      // Media re-hosting via stable tokens lands with cross-prefix support; for
      // now sections keep their URL refs (Strategy A: filenames preserved).
      addMedia: (_ref: MediaRefInput) => null,
      addFile: (name, content) => {
        const base = name.replace(/^media\//, '').replace(/[^A-Za-z0-9_.-]/g, '')
        if (base) mediaFiles.set(`media/${base}`, content)
      },
    }

    const files: ArchiveFile[] = []
    const sections: ManifestSection[] = []

    // Sections that will run (enabled owner + selected). Denominator for progress;
    // empty sections still count as processed so the bar reaches 100%.
    const runnables = registeredDataSections().filter(
      (s) => (s.owner === 'core' || enabled.get(s.owner)) && (!only || only.has(s.name))
    )
    const total = runnables.length
    let completed = 0

    for (const section of runnables) {
      const label = section.label ?? section.name
      await opts.onProgress?.({ completed, total, section: label, phase: 'start' })

      const payload = await section.export(ctx)
      const count = countRows(payload)
      if (count > 0) {
        files.push({
          name: `sections/${section.name}.json`,
          content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
        })
        sections.push({ name: section.name, owner: section.owner, count, tables: section.tables })
      }

      completed++
      await opts.onProgress?.({ completed, total, section: label, phase: 'done' })
    }

    for (const [name, content] of mediaFiles) files.push({ name, content })

    const manifest: Manifest = {
      _type: ARCHIVE_TYPE,
      formatVersion: FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      appVersion: CMS_VERSION,
      idMode: mode,
      includesMedia: mediaFiles.size > 0,
      sections,
    }
    files.unshift({
      name: 'manifest.json',
      content: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    })

    return packArchive(files)
  }
}
