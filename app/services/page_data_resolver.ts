import CmsService from '#services/cms_service'

const cmsService = new CmsService()

interface CollectionRef {
  key: string
  limit: number
}

/** Recursively find CollectionList blocks in a Puck node tree. */
function collectRefs(node: unknown, acc: CollectionRef[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefs(child, acc)
    return
  }
  if (node && typeof node === 'object') {
    const block = node as { type?: string; props?: Record<string, unknown> }
    const source = block.props?.source as { collectionKey?: string } | undefined
    if (block.type === 'CollectionList' && source?.collectionKey) {
      acc.push({ key: source.collectionKey, limit: Number(block.props?.limit) || 12 })
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
  const refs: CollectionRef[] = []
  for (const doc of docs) {
    if (!doc) continue
    collectRefs((doc as { content?: unknown }).content, refs)
    collectRefs((doc as { zones?: unknown }).zones, refs)
  }

  const map: Record<string, unknown[]> = {}
  for (const ref of refs) {
    const cacheKey = `${ref.key}:${ref.limit}`
    if (cacheKey in map) continue
    try {
      const result = await cmsService.listRecords(ref.key, {
        pageSize: ref.limit,
        status: 'PUBLISHED',
      })
      map[cacheKey] = result.items
    } catch {
      map[cacheKey] = []
    }
  }
  return map
}
