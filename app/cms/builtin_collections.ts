import type { CmsRecordDto } from '#services/cms_service'

/**
 * Built-in collections: content that lives in its own tables and admin pages
 * (blog posts, a module's products) but should still be bindable from the page
 * builder like any CMS collection — in a Collection List, a Collection
 * Template, and the Settings tab's "Get text from" dropdowns.
 *
 * Each entry is a read-only adapter over its model. `CmsService.listRecords` /
 * `findRecord` route to the adapter when the key matches, so everything built
 * on those — the public records API, the SSR preload, the builder's per-record
 * binding — works without knowing the difference. The CMS admin UI does NOT
 * list them: they have their own admin pages, and the generic record editor
 * would not know how to write to them.
 *
 * Core owns the registry; anything may register into it. A module registers
 * from its `boot()` (which only runs when the module is enabled) and passes an
 * `available` check so switching the module off at runtime hides the
 * collection again — the dependency stays one-way, core never imports a module.
 */

export interface BuiltinCollectionField {
  key: string
  label: string
  /** A CmsFieldType name; the builder maps it to text / image / link binding. */
  type: string
}

export interface BuiltinRecordQuery {
  page: number
  pageSize: number
  search?: string
  filterField?: string
  filterValue?: string
  sortField?: string
  sortDir?: 'asc' | 'desc'
}

export interface BuiltinRecordPage {
  items: CmsRecordDto[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface BuiltinCollection {
  key: string
  label: string
  icon?: string
  /** Shown as the group heading in pickers (e.g. "Content", "E-commerce"). */
  group?: string
  fields: BuiltinCollectionField[]
  /** Runtime gate — a disabled module's collection must vanish, not 500. */
  available?: () => Promise<boolean>
  /** Published records only; the adapter decides what "published" means. */
  list(query: BuiltinRecordQuery): Promise<BuiltinRecordPage>
  find(id: string): Promise<CmsRecordDto | null>
}

const registry = new Map<string, BuiltinCollection>()

export function registerBuiltinCollection(collection: BuiltinCollection): void {
  registry.set(collection.key, collection)
}

export function unregisterBuiltinCollection(key: string): void {
  registry.delete(key)
}

/** The adapter for `key`, or null when unknown or currently unavailable. */
export async function builtinCollection(key: string): Promise<BuiltinCollection | null> {
  const found = registry.get(key)
  if (!found) return null
  if (found.available && !(await found.available())) return null
  return found
}

/** Every registered adapter that is available right now, in registration order. */
export async function listBuiltinCollections(): Promise<BuiltinCollection[]> {
  const out: BuiltinCollection[] = []
  for (const c of registry.values()) {
    if (c.available && !(await c.available())) continue
    out.push(c)
  }
  return out
}

/** Whether `key` names a built-in collection (available or not). */
export function isBuiltinCollectionKey(key: string): boolean {
  return registry.has(key)
}

// ── Helpers shared by adapters ────────────────────────────────────────────

/** Plain-text excerpt of an HTML body: tags stripped, whitespace collapsed. */
export function excerptOf(html: string | null | undefined, max = 160): string {
  const text = String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`
}

/**
 * Apply the Collection List's server-side shaping to a model query.
 *
 * `columns` whitelists which field keys may filter/sort and names the column
 * behind each; anything not listed is ignored, never interpolated. The query
 * builder is typed loosely because every Lucid model has its own builder
 * type; only `where*`/`orderBy`/`count`/`limit`/`offset` are used.
 */
export function shapeBuiltinQuery(
  q: any,
  query: BuiltinRecordQuery,
  spec: {
    columns: Record<string, string>
    searchColumns: string[]
    defaultSort: { column: string; dir: 'asc' | 'desc' }
  }
): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 12))
  const offset = (page - 1) * pageSize

  const ff = query.filterField?.trim()
  const fv = query.filterValue?.trim()
  if (ff && fv && spec.columns[ff]) {
    q.whereRaw(`LOWER("${spec.columns[ff]}") LIKE ?`, [`%${fv.toLowerCase()}%`])
  }

  const search = query.search?.trim()
  if (search && spec.searchColumns.length) {
    const like = `%${search.toLowerCase()}%`
    q.where((b: any) => {
      for (const col of spec.searchColumns) b.orWhereRaw(`LOWER("${col}") LIKE ?`, [like])
    })
  }

  const sf = query.sortField?.trim()
  const dir: 'asc' | 'desc' = query.sortDir === 'asc' ? 'asc' : 'desc'
  if (sf === 'created_at' || sf === 'updated_at') q.orderBy(sf, dir)
  else if (sf && spec.columns[sf]) q.orderBy(spec.columns[sf], dir)
  else q.orderBy(spec.defaultSort.column, spec.defaultSort.dir)

  return { page, pageSize, offset }
}

export function pageOf(
  items: CmsRecordDto[],
  total: number,
  page: number,
  pageSize: number
): BuiltinRecordPage {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  }
}
