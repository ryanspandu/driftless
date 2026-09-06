import CmsService from '#services/cms_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * The content rows inside each DYNAMIC collection's `cms_<key>` table.
 *
 * `createRecord` mints a fresh ULID and ignores any incoming id, so record ids
 * are always regenerated — fine because records are only ever referenced
 * internally (by RELATION), and those references are rewritten through the
 * engine's `idMap`. MEDIA values are media ids, which the media section
 * preserves, so they need no remap.
 *
 * Two passes across ALL collections: (1) create every record with its
 * non-relation data, recording old→new ids; (2) set RELATION values, remapped
 * through the id map now that every target record exists.
 */
type RecordPayload = { id: string; status?: string; data: Record<string, unknown> }

function remapRelation(value: unknown, idMap: Map<string, string>): unknown {
  if (Array.isArray(value))
    return value.map((v) => (typeof v === 'string' ? (idMap.get(v) ?? v) : v))
  if (typeof value === 'string') return idMap.get(value) ?? value
  return value
}

export const collectionRecordsSection: DataSection = {
  name: 'collection_records',
  owner: 'core',
  order: 50,
  label: 'Collection content',

  async export() {
    const cms = new CmsService()
    const allCollections = await cms.listCollections()
    const dynamic = allCollections.filter((c) => c.source === 'DYNAMIC')
    const records: Record<string, RecordPayload[]> = {}
    for (const collection of dynamic) {
      const rows: RecordPayload[] = []
      let page = 1
      // Paginate through every record (any status) with raw relation/media ids.
      for (;;) {
        // No status filter → every record (draft + published).
        const res = await cms.listRecords(collection.key, { page, pageSize: 500 })
        for (const r of res.items) rows.push({ id: r.id, status: r.status, data: r.data })
        if (page >= res.totalPages || res.items.length === 0) break
        page++
      }
      if (rows.length > 0) records[collection.key] = rows
    }
    return { records }
  },

  async import(ctx, data) {
    const report = emptyReport('collection_records')
    const cms = new CmsService()
    const payload = (data ?? {}) as { records?: Record<string, RecordPayload[]> }
    const byCollection = payload.records ?? {}

    // Relation field keys per collection (present ones only).
    const relationKeys = new Map<string, Set<string>>()
    for (const key of Object.keys(byCollection)) {
      try {
        const c = await cms.findCollection(key)
        relationKeys.set(
          key,
          new Set(c.fields.filter((f) => f.type === 'RELATION').map((f) => f.key))
        )
      } catch {
        report.warnings.push(`collection "${key}" not found — skipping its records`)
      }
    }

    // Pass 1: create every record without relations; record old→new ids.
    const deferredRelations: Array<{ key: string; newId: string; data: Record<string, unknown> }> =
      []
    for (const [key, rows] of Object.entries(byCollection)) {
      if (!relationKeys.has(key)) continue
      const relKeys = relationKeys.get(key)!
      for (const row of rows) {
        const nonRelation: Record<string, unknown> = {}
        const relation: Record<string, unknown> = {}
        for (const [field, value] of Object.entries(row.data ?? {})) {
          if (relKeys.has(field)) relation[field] = value
          else nonRelation[field] = value
        }
        try {
          const created = await cms.createRecord(key, ctx.authorId, {
            data: nonRelation,
            status: row.status,
          })
          ctx.idMap.set(row.id, created.id)
          report.created++
          if (Object.keys(relation).length > 0) {
            deferredRelations.push({ key, newId: created.id, data: relation })
          }
        } catch (e) {
          report.warnings.push(`record ${key}/${row.id}: ${(e as Error).message}`)
        }
      }
    }

    // Pass 2: wire relations, remapped through the id map.
    for (const d of deferredRelations) {
      const remapped: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(d.data)) {
        remapped[field] = remapRelation(value, ctx.idMap)
      }
      try {
        await cms.updateRecord(d.key, d.newId, ctx.authorId, { data: remapped })
      } catch (e) {
        report.warnings.push(`relations ${d.key}/${d.newId}: ${(e as Error).message}`)
      }
    }
    return report
  },
}
