import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import app from '@adonisjs/core/services/app'
import TemplateKitState from '#models/template_kit_state'
import { packArchive, readArchive, type ArchiveFile } from '#services/data_transfer/bundle'

/**
 * Import / export of custom-code **template kits** — the folders under
 * `inertia/custom/kits/<id>/` (kit.json + hand-written `.tsx`/CSS/assets). Kits
 * are build-time (eager Vite globs + a generated manifest), so import can only
 * **stage files to disk**: the kit is not routable until the generator re-runs
 * and the front-end is rebuilt + the server restarts. Import also writes
 * executable code, so the controller gates it on the highest privilege.
 */

const KIT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
/** The committed reference kit — exportable, but never overwritten by an import. */
const PROTECTED_IDS = new Set(['example'])

const COUNT_DIRS = ['pages', 'templates', 'collection', 'emails', 'components'] as const

/** File extensions a kit bundle may contain (code, styles, config, assets). */
const ALLOWED_EXT = new Set([
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.css',
  '.json',
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
])
/** Top-level entries a kit bundle may contain (a file, or a known subfolder). */
const ALLOWED_TOP = new Set([
  'kit.json',
  'index.tsx',
  'styles.css',
  'README.md',
  'pages',
  'templates',
  'collection',
  'emails',
  'components',
  'lib',
  'assets',
])

export interface TemplateKitDto {
  id: string
  name: string
  description: string
  isolate: boolean
  protected: boolean
  /** Whether the kit's templates + file-pages are surfaced (fail-closed default). */
  active: boolean
  counts: Record<(typeof COUNT_DIRS)[number], number>
}

/**
 * Which kits are active, cached process-wide with a short TTL — the templates /
 * pages lists read this on every request, so it must be cheap, and the TTL lets
 * a toggle on one worker reach the others without cross-process messaging (same
 * reasoning as `modules_service`'s enabled cache).
 */
const ACTIVE_CACHE_TTL_MS = 10_000
let activeCache: Set<string> | null = null
let activeCacheLoadedAt = 0

export default class TemplateKitsService {
  private kitsDir(): string {
    return app.makePath('inertia/custom/kits')
  }

  private readMeta(id: string): { name: string; description: string; isolate: boolean } {
    try {
      const raw = readFileSync(join(this.kitsDir(), id, 'kit.json'), 'utf8')
      const json = JSON.parse(raw) as { name?: unknown; description?: unknown; isolate?: unknown }
      return {
        name: typeof json.name === 'string' && json.name.trim() ? json.name : id,
        description: typeof json.description === 'string' ? json.description : '',
        isolate: json.isolate === true,
      }
    } catch {
      return { name: id, description: '', isolate: false }
    }
  }

  private countIn(id: string, sub: string): number {
    const dir = join(this.kitsDir(), id, sub)
    if (!existsSync(dir)) return 0
    try {
      return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).length
    } catch {
      return 0
    }
  }

  /** The set of active kit slugs, cached with a short TTL. Fail-closed. */
  async activeSet(): Promise<Set<string>> {
    if (activeCache && activeCacheLoadedAt > 0 && Date.now() - activeCacheLoadedAt < ACTIVE_CACHE_TTL_MS) {
      return activeCache
    }
    const rows = await TemplateKitState.query().where('active', true)
    activeCache = new Set(rows.map((r) => r.slug))
    activeCacheLoadedAt = Date.now()
    return activeCache
  }

  bustActiveCache(): void {
    activeCache = null
    activeCacheLoadedAt = 0
  }

  /** Activate / deactivate a kit. Only a kit that exists on disk can be toggled. */
  async setActive(id: string, active: boolean): Promise<void> {
    if (!existsSync(join(this.kitsDir(), id, 'kit.json'))) {
      throw new Error(`Unknown template kit "${id}"`)
    }
    await TemplateKitState.updateOrCreate({ slug: id }, { slug: id, active })
    this.bustActiveCache()
  }

  /** Every installed kit (a folder containing `kit.json`), with its active state. */
  async list(): Promise<TemplateKitDto[]> {
    const base = this.kitsDir()
    if (!existsSync(base)) return []
    const active = await this.activeSet()
    const ids = readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(base, e.name, 'kit.json')))
      .map((e) => e.name)
    return ids
      .map((id) => {
        const meta = this.readMeta(id)
        const counts = Object.fromEntries(
          COUNT_DIRS.map((d) => [d, this.countIn(id, d)])
        ) as TemplateKitDto['counts']
        return { id, ...meta, protected: PROTECTED_IDS.has(id), active: active.has(id), counts }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Bundle a kit folder into a gzipped tar (`<id>.tar.gz`). */
  async exportKit(id: string): Promise<Buffer> {
    if (!KIT_ID_RE.test(id)) throw new Error('Invalid kit id')
    const dir = join(this.kitsDir(), id)
    if (!existsSync(join(dir, 'kit.json'))) throw new Error(`Kit "${id}" not found`)
    const files = this.walk(dir, dir)
    if (!files.length) throw new Error(`Kit "${id}" is empty`)
    return packArchive(files)
  }

  private walk(dir: string, base: string): ArchiveFile[] {
    const out: ArchiveFile[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        out.push(...this.walk(full, base))
      } else if (entry.isFile()) {
        const name = full.slice(base.length + 1).replace(/\\/g, '/')
        out.push({ name, content: readFileSync(full) })
      }
    }
    return out
  }

  /**
   * Stage an uploaded kit bundle to disk under `inertia/custom/kits/<id>/`.
   * Rejects traversal / disallowed files, a missing `kit.json`, and an id that
   * already exists. The kit is NOT live until a regenerate + rebuild + restart.
   */
  async importKit(buffer: Buffer, providedName?: string): Promise<{ id: string; files: number }> {
    const entries = await readArchive(buffer, safeKitEntryName)
    if (!entries.has('kit.json')) {
      throw new Error('Not a kit archive — no kit.json at the root.')
    }
    let metaName = ''
    try {
      const meta = JSON.parse(entries.get('kit.json')!.toString('utf8')) as { name?: unknown }
      if (typeof meta.name === 'string') metaName = meta.name
    } catch {
      throw new Error('kit.json is not valid JSON.')
    }

    const id = slugifyKitId(providedName || metaName || 'kit')
    if (!KIT_ID_RE.test(id)) throw new Error('Could not derive a valid kit id from the archive.')
    if (PROTECTED_IDS.has(id))
      throw new Error(`"${id}" is reserved — import under a different name.`)

    const dir = join(this.kitsDir(), id)
    if (existsSync(dir)) {
      throw new Error(
        `A kit "${id}" already exists — delete it first or import under another name.`
      )
    }

    for (const [name, content] of entries) {
      const dest = join(dir, name)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, content)
    }
    return { id, files: entries.size }
  }
}

/** Slugify a kit name into a safe folder id. */
function slugifyKitId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** Traversal + layout guard for a kit archive entry (see `bundle.ts safeEntryName`). */
function safeKitEntryName(raw: string): string | null {
  const name = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  if (name.startsWith('/') || name.includes('..') || name.includes('\0')) return null
  const parts = name.split('/')
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null
  if (!ALLOWED_TOP.has(parts[0]!)) return null
  if (!ALLOWED_EXT.has(extname(name).toLowerCase())) return null
  return name
}
