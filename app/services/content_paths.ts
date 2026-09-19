/**
 * Public URL prefixes of the built-in Content screens, in one dependency-free
 * place (no DB, no framework) so the server, the Inertia shared props and the
 * tests all agree on the same defaults and the same normalisation.
 *
 * The operator can move each screen from Website settings → URLs, e.g. the blog
 * to `/insights` (`/insights` archive + `/insights/:slug` post). The defaults
 * are the historical routes, so nothing changes until a value is set.
 *
 *   archive   `/blog`             (the posts index)
 *   detail    `/posts/:slug`      (one post)
 *   category  `/category/:slug`
 *   tag       `/tag/:slug`
 *
 * Stored in `web_settings` (section `content_paths`) WITHOUT a leading slash.
 * `inertia/types/api.ts` keeps a presentation mirror of the keys;
 * `tests/unit/content_paths.spec.ts` asserts the two never drift.
 */
export type ContentPathKind = 'archive' | 'detail' | 'category' | 'tag'

export type ContentPaths = Record<ContentPathKind, string>

export const CONTENT_PATH_SECTION = 'content_paths'

export const CONTENT_PATH_KEYS: Record<ContentPathKind, string> = {
  archive: 'posts_archive_prefix',
  detail: 'post_detail_prefix',
  category: 'category_prefix',
  tag: 'tag_prefix',
}

export const CONTENT_PATH_DEFAULTS: ContentPaths = {
  archive: 'blog',
  detail: 'posts',
  category: 'category',
  tag: 'tag',
}

export const CONTENT_PATH_KINDS = Object.keys(CONTENT_PATH_KEYS) as ContentPathKind[]

const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** A prefix is at most this long, like `PagesService`'s own path cap. */
export const CONTENT_PATH_MAX = 120

/** `" /Insights/ "` → `"insights"`. Does not validate. */
export function normalizePrefix(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
}

/** One or more `[a-z0-9-]` segments joined by `/`, no empty/edge dashes. */
export function isValidPrefix(prefix: string): boolean {
  if (!prefix || prefix.length > CONTENT_PATH_MAX) return false
  return prefix.split('/').every((segment) => SEGMENT.test(segment))
}

export function firstSegment(prefix: string): string {
  return prefix.split('/')[0] ?? ''
}

/**
 * The effective prefixes from merged `web_settings` sections. Read-time
 * sanitising: rows can arrive through import, MCP or a raw PUT, so anything
 * unusable falls back to that screen's default rather than breaking the route.
 */
export function mapContentPaths(
  sections: Record<string, Record<string, string> | undefined>,
  /**
   * Optional extra guard (e.g. `reservedFirstSegment` from `reserved_paths`, kept
   * out of this dependency-free module): a stored value the guard rejects falls
   * back to the default, so a row written around the validator (`admin`) can
   * never make `/blog` redirect into a reserved route.
   */
  isReserved?: (prefix: string) => unknown
): ContentPaths {
  const row = sections[CONTENT_PATH_SECTION] ?? {}
  const out = { ...CONTENT_PATH_DEFAULTS }
  for (const kind of CONTENT_PATH_KINDS) {
    const value = normalizePrefix(row[CONTENT_PATH_KEYS[kind]])
    if (isValidPrefix(value) && !isReserved?.(value)) out[kind] = value
  }
  return out
}

/**
 * `content_paths` patches, normalised: each value trimmed/lower-cased/slash-
 * stripped (an empty result stays `''` = reset), and only the LAST patch per key
 * kept — so the value that is validated is the value that is stored. Patches for
 * other sections pass through untouched, in order.
 */
export function normalizeContentPathPatches<
  T extends { section: string; key: string; value: string },
>(patches: T[]): T[] {
  const last = new Map<string, number>()
  patches.forEach((p, i) => {
    if (p.section === CONTENT_PATH_SECTION) last.set(p.key, i)
  })
  const out: T[] = []
  patches.forEach((p, i) => {
    if (p.section !== CONTENT_PATH_SECTION) {
      out.push(p)
    } else if (last.get(p.key) === i) {
      out.push({ ...p, value: normalizePrefix(p.value) })
    }
  })
  return out
}

/** `/insights/hello` (or `/insights` when no slug — the archive). */
export function contentPathUrl(paths: ContentPaths, kind: ContentPathKind, slug?: string): string {
  const prefix = `/${paths[kind]}`
  return slug ? `${prefix}/${slug}` : prefix
}
