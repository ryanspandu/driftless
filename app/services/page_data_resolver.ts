import CmsService from '#services/cms_service'

const cmsService = new CmsService()

interface CollectionQuery {
  key: string
  pageSize: number
  sortField: string
  sortDir: 'asc' | 'desc'
  filterField: string
  filterValue: string
}

/**
 * Derive a CollectionList block's server query from its props.
 *
 * MIRRORS `collectionQuery` + `collectionCacheKey` in
 * `inertia/puck/collection-list.tsx` (by copy, not import — different module
 * trees). The client looks up this preload under the identical key, so the two
 * must normalise the same. Change both together.
 */
function collectionQuery(
  source: { collectionKey?: string; titleField?: string } | undefined,
  props: Record<string, unknown>
): CollectionQuery {
  const key = source?.collectionKey ?? ''
  const perPage = Number(props.pageSize) || 0
  const pageSize = perPage > 0 ? perPage : Number(props.limit) || 12
  const titleField = source?.titleField
  const sort = String(props.sort ?? 'newest')
  let sortField = 'created_at'
  let sortDir: 'asc' | 'desc' = 'desc'
  if (sort === 'oldest') sortDir = 'asc'
  else if (sort === 'title-asc' && titleField) {
    sortField = titleField
    sortDir = 'asc'
  } else if (sort === 'title-desc' && titleField) {
    sortField = titleField
    sortDir = 'desc'
  }
  const filterField = String(props.filterField ?? '').trim()
  const filterValue = String(props.filterValue ?? '').trim()
  return { key, pageSize, sortField, sortDir, filterField, filterValue }
}

function cacheKey(q: CollectionQuery, page: number): string {
  return `${q.key}|${page}|${q.pageSize}|${q.sortField}|${q.sortDir}|${q.filterField}|${q.filterValue}`
}

/** Recursively find CollectionList blocks in a Puck node tree. */
function collectRefs(node: unknown, acc: CollectionQuery[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefs(child, acc)
    return
  }
  if (node && typeof node === 'object') {
    const block = node as { type?: string; props?: Record<string, unknown> }
    // `source` is normally `{ collectionKey }`, but forgive a bare key string
    // (must match the client coercion in collection-list.tsx) so SSR still
    // preloads the records.
    const rawSource = block.props?.source
    const source =
      typeof rawSource === 'string'
        ? { collectionKey: rawSource }
        : (rawSource as { collectionKey?: string; titleField?: string } | undefined)
    if (block.type === 'CollectionList' && source?.collectionKey) {
      acc.push(collectionQuery(source, block.props ?? {}))
    }

    /**
     * Recurse into every value, not just `props`.
     *
     * Puck's `zones` is a plain object keyed by zone id (`{ 'root:main': [...] }`)
     * with no `type` or `props` of its own. Descending only through `props`
     * meant a CollectionList placed inside a zone was never found, so it
     * silently lost its server-side data and fell back to a client fetch —
     * defeating the point of resolving it for SSR at all.
     */
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectRefs(value, acc)
    }
  }
}

/**
 * Pre-fetch the PUBLISHED records bound by every CollectionList block across the
 * given Puck docs (page content + header + footer), so SSR/SSG can render the
 * lists into the initial HTML. Keyed `${collectionKey}:${limit}` to match the
 * client lookup in `collection-list.tsx`.
 */
export async function resolvePageCollections(
  docs: Array<Record<string, unknown> | undefined | null>
): Promise<Record<string, unknown[]>> {
  const refs: CollectionQuery[] = []
  for (const doc of docs) {
    if (!doc) continue
    collectRefs((doc as { content?: unknown }).content, refs)
    collectRefs((doc as { zones?: unknown }).zones, refs)
  }

  // Only page 1 is preloaded for SSR/SSG first paint; later pages fetch on the
  // client. Keyed identically to the client's `collectionCacheKey(q, 1)`.
  const map: Record<string, unknown[]> = {}
  for (const q of refs) {
    const key = cacheKey(q, 1)
    if (key in map) continue
    try {
      const result = await cmsService.listRecords(
        q.key,
        {
          pageSize: q.pageSize,
          page: 1,
          status: 'PUBLISHED',
          sortField: q.sortField,
          sortDir: q.sortDir,
          filterField: q.filterField || undefined,
          filterValue: q.filterValue || undefined,
        },
        // SSR/SSG preload mirrors the public endpoint: relation labels, not ids,
        // and MEDIA fields resolved to their public URL so image bindings render.
        { resolveRelations: true, resolveMedia: true }
      )
      map[key] = result.items
    } catch {
      // Leave the key ABSENT on a resolve failure — do NOT store `[]`. An empty
      // array is a legitimate "collection is empty" preload that suppresses the
      // client fetch; a swallowed error must instead fall through to the client
      // fetch so a transient failure doesn't strand the list permanently empty.
    }
  }
  return map
}
