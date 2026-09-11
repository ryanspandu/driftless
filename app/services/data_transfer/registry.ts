import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * The registry every exportable data section plugs into.
 *
 * Core owns the engine; whoever owns a body of data declares how to serialize
 * and restore it here. Core registers its sections from
 * `providers/data_transfer_provider.ts`; an optional module registers its own
 * from its `boot()` hook — the same one-way shape as `sitemap_registry.ts` and
 * `mail_events.ts`, so core never names a module and a module never reaches
 * into another.
 *
 * Registration is **replace-by-name** (like `registerSitemapSource`, NOT
 * throw-on-dup like `registerMailEvent`): a module's `boot()` can run more than
 * once across a process's life, and a second registration must be a no-op, not
 * a crash.
 *
 * `owner` is the linchpin: a module's `boot()` registration persists for the
 * whole process even after the module is toggled off (the enabled cache has a
 * ~10s TTL, no restart), so the export/import engine re-checks
 * `ModulesService.enabledMap()` at run time and skips any section whose owner
 * module is not currently enabled. Core (`owner: 'core'`) is never filtered.
 */

export type IdMode = 'preserve' | 'regenerate'
export type ConflictMode = 'overwrite' | 'skip' | 'replace'

/** What one section did during an import, folded into the overall report. */
export interface SectionReport {
  name: string
  created: number
  updated: number
  skipped: number
  warnings: string[]
}

export function emptyReport(name: string): SectionReport {
  return { name, created: 0, updated: 0, skipped: 0, warnings: [] }
}

/** A media asset a section needs bundled, addressed by id or self-hosted URL. */
export interface MediaRefInput {
  id?: string | null
  url?: string | null
}

export interface ExportCtx {
  mode: IdMode
  /** Selected section names + per-section sub-toggles (e.g. `ecommerce:orders`). */
  selected: Set<string>
  isSelected(key: string): boolean
  /**
   * Declare a binary the section references. Returns a stable token
   * (`media:<ulid>`) to store in the payload in place of the raw id/url, or
   * `null` when the ref is empty/unresolvable. The engine collects the bytes
   * into the archive's `media/` dir.
   */
  addMedia(ref: MediaRefInput): string | null
  /**
   * Add a raw file to the archive under `media/<name>` (name must be a bare,
   * traversal-free basename). Used by sections that own their own binaries
   * (the media library, ecommerce digital assets).
   */
  addFile(name: string, content: Buffer): void
}

export interface ImportCtx {
  /** Present when the engine wraps the run in a transaction; model-level
   *  sections should honour it. Config sections may write via their services. */
  trx?: TransactionClientContract
  mode: IdMode
  conflict: ConflictMode
  /** old ULID -> new ULID. Identity in preserve mode; fresh ids in regenerate. */
  idMap: Map<string, string>
  /** Map a `media:<ulid>` token back to the freshly-hosted URL (and id). */
  resolveMediaRef(token: string): { id: string; url: string } | null
  /** The user to attribute imported content to (environment-local author FKs). */
  authorId: number | null
  /** Read a bundled binary previously stored via `ExportCtx.addFile`. */
  getFile(name: string): Buffer | undefined
  /** Append a human-readable line to the import report. */
  log(line: string): void
}

export interface DataSection {
  /** Bundle section key, e.g. `pages`, `collections`, `ecommerce`. */
  name: string
  /** `'core'` or the owning module name — drives the enabled-module filter. */
  owner: 'core' | string
  /**
   * Run order. Core: media 10, components 20, collections 30, templates 40,
   * records 50, pages 60, settings 70. Modules 100+.
   */
  order: number
  label?: string
  /** Physical tables the section owns — for `conflict:'replace'` + row counts. */
  tables?: string[]
  export(ctx: ExportCtx): Promise<unknown>
  import(ctx: ImportCtx, data: unknown): Promise<SectionReport>
}

const sections = new Map<string, DataSection>()

/** Register (or replace) a section. Named so a module re-boot is idempotent. */
export function registerDataSection(section: DataSection): void {
  sections.set(section.name, section)
}

/** Every registered section, ordered by `order` then `name`. */
export function registeredDataSections(): DataSection[] {
  return [...sections.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

export function getDataSection(name: string): DataSection | undefined {
  return sections.get(name)
}

/** Test seam. */
export function clearDataSections(): void {
  sections.clear()
}
