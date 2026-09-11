import type CmsService from '#services/cms_service'
import type { CmsCollectionDto, CmsRecordDto } from '#services/cms_service'
import { coerceFieldValue, recordLabel } from '#cms/field_values'

/**
 * Shared custom-field plumbing for the metadata-only collection types.
 *
 * A metadata-only collection (CONTENT, PRODUCT) owns no records of its own — its
 * fields extend a built-in editor and their values live in that host row's `data`
 * JSON (`contents.data`, `ecommerce_products.data`). The write-side coercion and
 * the read-side public resolution are identical whichever host they extend, so
 * they live here and are called with the relevant metadata collection:
 * `ContentService` passes `contentTypeCollection()`, the ecommerce catalog passes
 * `productTypeCollection()`.
 */

/**
 * Coerce + filter an incoming custom-field payload against a metadata collection's
 * schema: unknown keys are dropped, each value is coerced by its field type
 * (reusing the CMS field-value logic). Returns null when there is no such
 * collection or nothing survives — the host stores null rather than `{}`.
 */
export function coerceCustomData(
  collection: CmsCollectionDto | null,
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (data === null || typeof data !== 'object') return null
  if (!collection || collection.fields.length === 0) return null
  const out: Record<string, unknown> = {}
  for (const field of collection.fields) {
    if (!(field.key in data)) continue
    out[field.key] = coerceFieldValue(field, (data as Record<string, unknown>)[field.key])
  }
  return Object.keys(out).length ? out : null
}

/**
 * Public read-side resolution of a host row's custom fields: RELATION ids become
 * their target records' labels (single → a label, multi → an array of labels),
 * MEDIA ids become their public URLs. Mirrors the CMS record resolution so a
 * metadata-extended row renders the same way a collection record would. Missing/
 * deleted targets degrade to blank rather than erroring.
 */
export async function resolvePublicCustomData(
  cms: CmsService,
  collection: CmsCollectionDto | null,
  data: Record<string, unknown> | null
): Promise<Record<string, unknown> | null> {
  if (!data) return null
  if (!collection) return data
  const out: Record<string, unknown> = { ...data }

  // RELATION ids → labels, batched per target collection.
  const relFields = collection.fields.filter((f) => f.type === 'RELATION')
  const idsByTarget = new Map<string, Set<string>>()
  for (const f of relFields) {
    const targetKey = typeof f.config?.targetKey === 'string' ? f.config.targetKey : ''
    if (!targetKey) continue
    const v = out[f.key]
    const bucket = idsByTarget.get(targetKey) ?? new Set<string>()
    if (typeof v === 'string' && v) bucket.add(v)
    else if (Array.isArray(v))
      for (const id of v) if (typeof id === 'string' && id) bucket.add(id)
    if (bucket.size) idsByTarget.set(targetKey, bucket)
  }
  const byTarget = new Map<string, Map<string, CmsRecordDto>>()
  for (const [targetKey, ids] of idsByTarget) {
    try {
      byTarget.set(targetKey, await cms.recordsByIds(targetKey, [...ids]))
    } catch {
      byTarget.set(targetKey, new Map())
    }
  }
  for (const f of relFields) {
    const targetKey = typeof f.config?.targetKey === 'string' ? f.config.targetKey : ''
    const byId = (targetKey && byTarget.get(targetKey)) || new Map<string, CmsRecordDto>()
    const v = out[f.key]
    if (Array.isArray(v)) {
      out[f.key] = v
        .map((id) => (typeof id === 'string' ? byId.get(id) : undefined))
        .filter((r): r is CmsRecordDto => !!r)
        .map((r) => recordLabel(r))
    } else if (typeof v === 'string' && v) {
      const target = byId.get(v)
      out[f.key] = target ? recordLabel(target) : ''
    } else {
      out[f.key] = ''
    }
  }

  // MEDIA ids → public URLs (a value that is already a URL is left as-is).
  const mediaFields = collection.fields.filter((f) => f.type === 'MEDIA')
  if (mediaFields.length) {
    const { default: MediaService } = await import('#services/media_service')
    const media = new MediaService()
    const isUrl = (s: string) => /^(https?:)?\/\//.test(s) || s.startsWith('/')
    for (const f of mediaFields) {
      const v = out[f.key]
      if (typeof v === 'string' && v && !isUrl(v)) {
        try {
          const dto = await media.findOne(v)
          if (dto?.url) out[f.key] = dto.url
        } catch {
          // Unknown/deleted media id — leave the stored value untouched.
        }
      }
    }
  }

  return out
}
