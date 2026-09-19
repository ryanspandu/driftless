import CmsCollection from '#models/cms_collection'
import Page from '#models/page'
import WebSetting from '#models/web_setting'
import { FILE_PAGES } from '#services/custom_templates.generated'
import { reservedFirstSegment } from '#services/reserved_paths'
import {
  CONTENT_PATH_DEFAULTS,
  CONTENT_PATH_KEYS,
  CONTENT_PATH_KINDS,
  CONTENT_PATH_SECTION,
  contentPathUrl,
  firstSegment,
  isValidPrefix,
  mapContentPaths,
  normalizeContentPathPatches,
  normalizePrefix,
  type ContentPathKind,
  type ContentPaths,
} from '#services/content_paths'

export interface ContentPathMatch {
  kind: ContentPathKind
  /** Set for `detail`, `category` and `tag`; absent for the archive. */
  slug?: string
}

const KIND_LABEL: Record<ContentPathKind, string> = {
  archive: 'Posts archive',
  detail: 'Post page',
  category: 'Category archive',
  tag: 'Tag archive',
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Where the Content screens live, resolved per request.
 *
 * Routes are registered once at boot, so a prefix an operator can change at
 * runtime cannot be a route. The historical routes (`/blog`, `/posts/:slug`,
 * `/category/:slug`, `/tag/:slug`) stay as they are and 301 to the configured
 * URL when it differs; the configured URL itself is matched in the CMS catch-all
 * (`PagesPublicController.show`) and handed to the same handlers.
 *
 * No process cache on purpose: the read is one indexed query on a path that
 * would otherwise 404, and a cache would go stale across workers and tests.
 */
export default class ContentPathsService {
  async get(): Promise<ContentPaths> {
    const rows = await WebSetting.query()
      .where('section', CONTENT_PATH_SECTION)
      .whereNull('deleted_at')
    const values: Record<string, string> = {}
    for (const row of rows) values[row.key] = row.value
    return mapContentPaths({ [CONTENT_PATH_SECTION]: values }, reservedFirstSegment)
  }

  /** The public URL of a screen, e.g. `/insights/hello`. */
  async urlFor(kind: ContentPathKind, slug?: string): Promise<string> {
    return contentPathUrl(await this.get(), kind, slug)
  }

  /**
   * Match a catch-all path (no leading slash) against the configured prefixes.
   * The archive is an exact match; every other screen is `<prefix>/<one slug>`.
   */
  async match(path: string): Promise<ContentPathMatch | null> {
    const paths = await this.get()
    if (path === paths.archive) return { kind: 'archive' }
    for (const kind of ['detail', 'category', 'tag'] as const) {
      const prefix = `${paths[kind]}/`
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (rest && !rest.includes('/')) return { kind, slug: safeDecode(rest) }
    }
    return null
  }

  /**
   * The path to 301 to when a request arrived on a screen's historical route
   * but the operator moved it, else null. The query string (`?q=`) is carried
   * over by the framework (`redirect.forwardQueryString` in config/app.ts), so
   * only the path is returned. A request already on the configured URL
   * (delegated from the catch-all) is never redirected.
   */
  async movedTo(
    request: { url(includeQueryString?: boolean): string },
    kind: ContentPathKind,
    slug?: string
  ): Promise<string | null> {
    const expected = await this.urlFor(kind, slug)
    const path = request.url()
    const actual = safeDecode(path.length > 1 ? path.replace(/\/+$/, '') : path)
    return actual === expected ? null : expected
  }

  /**
   * Validate the prefixes that would be in effect after `patches`. Returns
   * human-readable issues (empty = fine). Only prefixes that differ from the
   * historical default are checked against pages and reserved paths, so an
   * install that never touches this setting behaves exactly as before.
   */
  async validate(
    patches: Array<{ section: string; key: string; value: string }>,
    opts: {
      /**
       * Check the prefixes against live Pages / kit file-pages. Off for an import,
       * where a Page on the prefix is a legitimate source state (a Page wins over
       * the screen at runtime) and must not make the setting unrestorable.
       */
      checkExistingPaths?: boolean
    } = {}
  ): Promise<string[]> {
    const checkExistingPaths = opts.checkExistingPaths !== false
    const touched = normalizeContentPathPatches(patches).filter(
      (p) => p.section === CONTENT_PATH_SECTION
    )
    if (touched.length === 0) return []

    const issues: string[] = []
    const next: ContentPaths = await this.get()
    for (const kind of CONTENT_PATH_KINDS) {
      const patch = touched.find((p) => p.key === CONTENT_PATH_KEYS[kind])
      if (!patch) continue
      const value = normalizePrefix(patch.value)
      if (!value) {
        next[kind] = CONTENT_PATH_DEFAULTS[kind] // empty resets to the default
      } else if (isValidPrefix(value)) {
        next[kind] = value
      } else {
        issues.push(
          `${KIND_LABEL[kind]}: "${patch.value}" is not a valid URL prefix. Use lowercase letters, numbers and dashes, with "/" between segments.`
        )
      }
    }
    if (issues.length) return issues

    const pageRows = await Page.query().whereNull('deleted_at').select('path')
    const pagePaths = pageRows.map((p) => p.path)
    const filePaths = FILE_PAGES.map((fp) => fp.path)
    const collectionRows = await CmsCollection.query()
      .where('detail_pages_on', true)
      .whereNull('deleted_at')
      .select('detail_path_prefix')
    const collectionPrefixes = collectionRows.map((c) => c.detailPathPrefix)

    for (const kind of CONTENT_PATH_KINDS) {
      const value = next[kind]
      if (value === CONTENT_PATH_DEFAULTS[kind]) continue
      const label = KIND_LABEL[kind]

      const reserved = reservedFirstSegment(value)
      if (reserved) {
        issues.push(`${label}: "${reserved}" is reserved by the system and cannot be used.`)
      }

      // Another screen's historical route that has been moved away would still
      // answer here (as a redirect), so reusing its first segment is a swap trap.
      for (const other of CONTENT_PATH_KINDS) {
        if (other === kind) continue
        const otherDefault = firstSegment(CONTENT_PATH_DEFAULTS[other])
        if (firstSegment(value) === otherDefault && next[other] !== CONTENT_PATH_DEFAULTS[other]) {
          issues.push(
            `${label}: "${firstSegment(value)}" is the old address of ${KIND_LABEL[other].toLowerCase()}, which has been moved. Pick a different prefix.`
          )
        }
      }

      // `<prefix>/<slug>` screens must not be ambiguous with each other.
      if (kind !== 'archive') {
        for (const other of ['detail', 'category', 'tag'] as const) {
          if (other !== kind && next[other] === value) {
            issues.push(
              `${label} and ${KIND_LABEL[other].toLowerCase()} cannot share the prefix "${value}".`
            )
          }
        }
      }

      const usedByCollection = collectionPrefixes.find((c) => c && c === firstSegment(value))
      if (usedByCollection) {
        issues.push(
          `${label}: "${usedByCollection}" is already the detail prefix of a collection's public pages.`
        )
      }

      if (!checkExistingPaths) continue
      const clash = (path: string) =>
        (kind === 'archive' && path === value) || path.startsWith(`${value}/`)
      const page = pagePaths.find(clash)
      if (page) {
        issues.push(
          `${label}: a page already exists at "/${page}". Move or delete it first — a page wins over the ${label.toLowerCase()} on the same path.`
        )
      }
      const file = filePaths.find(clash)
      if (file) {
        issues.push(`${label}: a custom template page is served at "/${file}".`)
      }
    }

    return [...new Set(issues)]
  }

  /**
   * Why a Page may NOT be saved at this path, or null. A Page beats the content
   * screens (and collection detail pages) on the same path, so once a screen has
   * been moved a Page created under its prefix would silently shadow the archive
   * or a post. Only prefixes that differ from the historical default are
   * enforced — with the defaults `/blog` etc. are static routes that already win —
   * so an untouched install is unaffected. Collection detail prefixes are enforced
   * below the prefix only: the bare `/<prefix>` may be the collection's own list
   * page.
   */
  async pathConflict(path: string): Promise<string | null> {
    const normalized = path.replace(/^\/+|\/+$/g, '')
    if (!normalized) return null
    const paths = await this.get()
    for (const kind of CONTENT_PATH_KINDS) {
      const prefix = paths[kind]
      if (prefix === CONTENT_PATH_DEFAULTS[kind]) continue
      const hit =
        (kind === 'archive' && normalized === prefix) || normalized.startsWith(`${prefix}/`)
      if (hit) {
        return `"/${normalized}" is under "/${prefix}", where your ${KIND_LABEL[kind].toLowerCase()} lives (Website settings → URLs). A page there would hide it — pick another path or move the URL first.`
      }
    }
    const collections = await CmsCollection.query()
      .where('detail_pages_on', true)
      .whereNotNull('detail_path_prefix')
      .whereNull('deleted_at')
      .select('label', 'detail_path_prefix')
    for (const c of collections) {
      if (c.detailPathPrefix && normalized.startsWith(`${c.detailPathPrefix}/`)) {
        return `"/${normalized}" is under "/${c.detailPathPrefix}", where the "${c.label}" collection serves its public entry pages. A page there would hide an entry with the same slug — pick another path.`
      }
    }
    return null
  }
}
