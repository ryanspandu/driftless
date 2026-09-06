import CmsService, { type CmsCollectionDto } from '#services/cms_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * CMS collection SCHEMAS (only operator-authored DYNAMIC collections — the
 * built-in adapters like `posts`/`products` answer from their own module and
 * are skipped). Natural key is `key`.
 *
 * Two-pass import: `createCollection` builds the row, its fields AND the
 * physical `cms_<key>` table, but a RELATION field's real storage (FK column /
 * join table / inverse column) is only wired by `addField` and requires the
 * target collection to already exist. So scalar/MEDIA/SELECT/COMPONENT fields
 * go in on create, and RELATION fields are added in a second pass once every
 * collection exists. (`addField` forces added fields optional — a RELATION that
 * was `required` at the source becomes optional; documented, rare.)
 */
const RELATION = 'RELATION'

function isDynamic(c: CmsCollectionDto): boolean {
  return c.source === 'DYNAMIC'
}

export const collectionsSection: DataSection = {
  name: 'collections',
  owner: 'core',
  order: 30,
  label: 'Collections (schema)',
  tables: ['cms_collections', 'cms_fields'],

  async export() {
    const cms = new CmsService()
    const all = await cms.listCollections()
    const collections = all.filter(isDynamic)
    return {
      collections: collections.map((c) => ({
        key: c.key,
        label: c.label,
        icon: c.icon,
        group: c.group,
        kind: c.kind,
        revisionsOn: c.revisionsOn,
        draftsOn: c.draftsOn,
        fields: c.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          unique: f.unique,
          config: f.config,
        })),
      })),
    }
  },

  async import(_ctx, data) {
    const report = emptyReport('collections')
    const cms = new CmsService()
    const payload = (data ?? {}) as {
      collections?: Array<{
        key: string
        label: string
        icon?: string | null
        group?: string | null
        kind?: 'collection' | 'single'
        revisionsOn?: boolean
        draftsOn?: boolean
        fields?: Array<{
          key: string
          label: string
          type: string
          required?: boolean
          unique?: boolean
          config?: Record<string, unknown>
        }>
      }>
    }
    const collections = payload.collections ?? []
    const current = await cms.listCollections()
    const existing = new Set(current.map((c) => c.key))

    // Pass 1: create collections with their non-relation fields.
    for (const c of collections) {
      if (existing.has(c.key)) {
        report.skipped++
        continue
      }
      const scalarFields = (c.fields ?? [])
        .filter((f) => f.type !== RELATION)
        .map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type as never,
          required: f.required,
          unique: f.unique,
          config: f.config,
        }))
      await cms.createCollection({
        key: c.key,
        label: c.label,
        icon: c.icon ?? undefined,
        group: c.group ?? undefined,
        kind: c.kind ?? 'collection',
        revisionsOn: c.revisionsOn,
        draftsOn: c.draftsOn,
        fields: scalarFields,
      })
      report.created++
    }

    // Pass 2: wire RELATION fields now that every target collection exists.
    for (const c of collections) {
      for (const f of c.fields ?? []) {
        if (f.type !== RELATION) continue
        try {
          await cms.addField(c.key, {
            key: f.key,
            label: f.label,
            type: RELATION as never,
            config: f.config,
          })
        } catch (e) {
          report.warnings.push(`relation ${c.key}.${f.key}: ${(e as Error).message}`)
        }
      }
    }
    return report
  },
}
