/**
 * Rewrite every cross-reference in a JSON value through an old→new string map.
 *
 * Used in `regenerate` import mode, where every entity gets a fresh ULID: the
 * map holds `oldId → newId` (and `oldMediaUrl → newMediaUrl`), and this walks a
 * Puck document, a record's data, a settings blob or a table row and swaps any
 * string that is a map key for its replacement.
 *
 * Safe because the keys are ULIDs / self-hosted media URLs — distinctive enough
 * that an incidental content string never collides with one. Returns a fresh
 * value; the input is not mutated.
 */
export function rewriteRefs<T>(value: T, map: Map<string, string>): T {
  if (map.size === 0) return value
  return walk(value, map) as T
}

function walk(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return map.get(value) ?? value
  }
  if (Array.isArray(value)) {
    return value.map((v) => walk(v, map))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, map)
    }
    return out
  }
  return value
}
