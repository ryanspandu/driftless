import dbConfig from '#config/database'
import { sanitizeRichText } from '#services/html_sanitizer_service'

/**
 * Field-value primitives shared between the Collections engine (`cms_service`)
 * and the built-in Content editor. Content-type collections reuse the exact
 * same coercion and relation-label logic as dynamic collections, so these live
 * in one place rather than being duplicated across services.
 *
 * All functions are pure (no service state), typed structurally so a
 * `CmsField` model or a plain DTO both satisfy them.
 */

export function isPostgres(): boolean {
  const connection = dbConfig.connection
  const client = dbConfig.connections[connection]?.client
  return client === 'pg'
}

/**
 * A short human label for a related record — the first non-empty of
 * title/name/label/slug, else any string field, else the id.
 *
 * Mirrors the admin `recordLabel` (`inertia/components/cms/field-renderer.tsx`)
 * so the page renderer can turn a relation's target id into readable text
 * server-side.
 */
export function recordLabel(record: { id: string; data?: Record<string, unknown> | null }): string {
  const data = (record.data ?? {}) as Record<string, unknown>
  for (const k of ['title', 'name', 'label', 'slug']) {
    const v = data[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v.trim()) return v
  }
  return record.id
}

/**
 * Coerce + validate a supplied scalar value by field type. Throws a
 * user-facing error for malformed input. Empty/nullish values pass through —
 * required-ness is enforced separately by the caller.
 */
export function coerceFieldValue(field: { type: string; label: string }, val: unknown): unknown {
  if (val === undefined || val === null || val === '') return val
  switch (field.type) {
    case 'EMAIL': {
      const s = String(val).trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new Error(`${field.label} must be a valid email address`)
      }
      return s
    }
    case 'INTEGER': {
      const n = Number(val)
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error(`${field.label} must be a whole number`)
      }
      return n
    }
    case 'DECIMAL': {
      const n = Number(val)
      if (!Number.isFinite(n)) {
        throw new Error(`${field.label} must be a number`)
      }
      return n
    }
    case 'RICHTEXT':
      return sanitizeRichText(val)
    default:
      return val
  }
}

/**
 * Serialize a scalar value for its physical column: JSON-ish types stringify,
 * BOOL narrows to the connection's boolean shape, everything else passes
 * through. (Content stores its custom fields as a single JSON blob and so does
 * not need per-column serialization; this is for the dynamic-table path.)
 */
export function serializeFieldValue(type: string, val: unknown): unknown {
  if (val === undefined || val === null) return null
  if (type === 'JSON' || type === 'RICHTEXT' || type === 'REPEATABLE' || type === 'COMPONENT') {
    return typeof val === 'string' ? val : JSON.stringify(val)
  }
  if (type === 'BOOL') {
    if (isPostgres()) return Boolean(val)
    return val ? 1 : 0
  }
  return val
}
