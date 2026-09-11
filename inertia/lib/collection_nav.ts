import type { CmsCollectionDto } from '~/types/api'

export interface CollectionNavSection {
  /** Stable section id: `__ungrouped__` or `group:<name>`. Used as the reorder key. */
  key: string
  /** Header label shown in the sidebar / arranger. */
  label: string
  cols: CmsCollectionDto[]
}

/**
 * Group dynamic collections into sidebar sections, exactly as the sidebar
 * renders them: ungrouped collections under a default "Collections" section
 * first, then one section per distinct `group` value (group name = header),
 * groups alphabetised as the default order. Native (PRISMA) collections are
 * excluded — each already has a dedicated top-level nav item.
 *
 * Shared by the sidebar (render) and Settings → General (the arranger) so the
 * two never drift on how collections are grouped or default-ordered. The
 * arranger's saved order is layered on top via `nav_order.collections` (section
 * order) and `nav_order['col:'+section.key]` (collections within a section).
 */
export function buildCollectionSections(collections: CmsCollectionDto[]): CollectionNavSection[] {
  const ungrouped: CmsCollectionDto[] = []
  const grouped = new Map<string, CmsCollectionDto[]>()

  // Metadata-only collections (Content / Product) define fields for a built-in
  // editor and own no records of their own — they never appear as a records link.
  const dynamicCollections = collections.filter(
    (c) => c.source === 'DYNAMIC' && c.type !== 'CONTENT' && c.type !== 'PRODUCT'
  )

  for (const col of dynamicCollections) {
    const group = col.group?.trim()
    if (!group) {
      ungrouped.push(col)
      continue
    }
    const existing = grouped.get(group)
    if (existing) existing.push(col)
    else grouped.set(group, [col])
  }

  const sections: CollectionNavSection[] = []
  if (ungrouped.length > 0) {
    sections.push({ key: '__ungrouped__', label: 'Collections', cols: ungrouped })
  }
  for (const [label, cols] of Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    sections.push({ key: `group:${label}`, label, cols })
  }
  return sections
}
