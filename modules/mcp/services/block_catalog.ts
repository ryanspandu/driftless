import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import app from '@adonisjs/core/services/app'

/**
 * A single block the builder understands, in the machine-readable form an AI
 * client needs to compose a valid Puck document. Emitted by `node ace
 * mcp:catalog` from the React Puck config (`inertia/puck/config.tsx` et al.) —
 * see `commands/mcp_catalog.ts`. The Adonis runtime never imports the React
 * config; it reads the emitted JSON instead, so the server stays free of the
 * front-end bundle.
 */
export interface CatalogBlock {
  type: string
  label: string
  category: string
  /**
   * The module that contributes this block, or `null` for a core block. A
   * module block only renders while its module is enabled, so prefer core
   * blocks unless the site uses that module.
   */
  module: string | null
  /** Prop names whose value is a nested array of blocks (Puck `slot` fields). */
  slots: string[]
  /** Field name → a compact descriptor (type + label + options for selects). */
  fields: Record<string, CatalogField>
  /** A ready-to-use worked example of valid props for this block. */
  defaultProps?: Record<string, unknown>
  /**
   * A one-line "when to reach for this block" hint, so the AI picks the
   * purpose-built block for a design section instead of composing it from
   * scratch. Present only for the blocks worth steering toward; absent otherwise.
   */
  useFor?: string
  /** Shared style prop names (border, spacing, …) every block also accepts. */
  styleProps: string[]
}

/**
 * How to assemble one recurring design section from blocks — the missing link
 * between "here are the blocks" and "here is how a real page is built". Keyed by
 * a section name an AI would recognise from a design (hero, productGrid, faq, …).
 */
export interface CatalogRecipe {
  /** The design section this recipe builds (e.g. "Product grid"). */
  section: string
  /** The ordered blocks to nest, outermost first. */
  blocks: string[]
  /** A short note on how to wire them and what to watch for. */
  note: string
}

/**
 * Editorial guidance served alongside the raw block list so the AI builds pages
 * that match a design instead of stacking bare blocks. `rules` are hard
 * do/don't statements; `recipes` are per-section compositions (page target only).
 */
export interface CatalogGuidance {
  rules: string[]
  recipes?: CatalogRecipe[]
}

export interface CatalogField {
  type: string
  label?: string
  options?: Array<{ label: string; value: string | number }>
  /** For `type: "object"` — the nested field shapes. */
  objectFields?: Record<string, CatalogField>
  /** For `type: "array"` — each item's field shapes. */
  arrayFields?: Record<string, CatalogField>
  /** For `type: "array"` — a worked example of one item. */
  defaultItemProps?: Record<string, unknown>
}

export interface Catalog {
  /** Which builder surface this catalog describes. */
  target: CatalogTarget
  generatedAt: string
  /** How a Puck document is shaped, spelled out for the AI. */
  contentShape: string
  /**
   * Editorial guidance (rules + per-section recipes) that steers the AI toward
   * the right blocks for a design. Emitted for the `page` target; a trimmed set
   * of layout rules for the others.
   */
  guidance?: CatalogGuidance
  blocks: CatalogBlock[]
  /**
   * Names of modules currently ENABLED at runtime. Appended when the catalog is
   * served (not baked into the emitted file). A block whose `module` is not in
   * this list won't render — the validator rejects it and the AI should prefer
   * a core block.
   */
  enabledModules?: string[]
}

export type CatalogTarget = 'page' | 'collection' | 'email'

const CATALOG_FILES: Record<CatalogTarget, string> = {
  page: 'catalog.page.json',
  collection: 'catalog.collection.json',
  email: 'catalog.email.json',
}

const here = dirname(fileURLToPath(import.meta.url))

function catalogDir(): string {
  // `resources/mcp/` at the repo root — written by the emitter, read here.
  // Resolve from the app root so it works in dev (TS) and built (JS) alike.
  try {
    return app.makePath('resources', 'mcp')
  } catch {
    return join(here, '..', '..', '..', 'resources', 'mcp')
  }
}

const cache = new Map<CatalogTarget, Catalog | null>()

/**
 * Load one target's catalog, or `null` if it has not been emitted yet. A null
 * result makes the structural validator non-enforcing rather than rejecting
 * every write — a fresh checkout that has not run `node ace mcp:catalog` can
 * still build pages, just without block-type checking.
 */
export async function loadCatalog(target: CatalogTarget): Promise<Catalog | null> {
  if (cache.has(target)) return cache.get(target)!
  try {
    const raw = await readFile(join(catalogDir(), CATALOG_FILES[target]), 'utf8')
    const parsed = JSON.parse(raw) as Catalog
    cache.set(target, parsed)
    return parsed
  } catch {
    cache.set(target, null)
    return null
  }
}

/** Force the next `loadCatalog` to re-read from disk (used after re-emitting). */
export function clearCatalogCache(): void {
  cache.clear()
}
