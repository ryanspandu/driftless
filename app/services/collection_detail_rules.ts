import CmsCollection from '#models/cms_collection'
import Page from '#models/page'
import ContentPathsService from '#services/content_paths_service'
import { CONTENT_PATH_DEFAULTS, firstSegment } from '#services/content_paths'
import { reservedFirstSegment } from '#services/reserved_paths'

/**
 * Rules for a collection's "Public detail pages" settings (`detail_pages_on`,
 * `detail_path_prefix`, `detail_page_id`). Kept apart from `CmsService` (which
 * enforces them on create/update) and `CollectionDetailService` (which serves the
 * pages) so neither has to import the other.
 */

/** A refusal caused by the public-detail-page settings themselves (not by the rest of a collection). */
export class DetailSettingsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DetailSettingsError'
  }
}

export interface DetailSettings {
  on: boolean
  prefix: string | null
  pageId: string | null
}

const PREFIX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PREFIX_MAX = 64

/** `" /Portfolio/ "` → `"portfolio"`; empty → null. */
export function normalizeDetailPrefix(raw: unknown): string | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
  return v || null
}

/**
 * The first segments the built-in Content screens answer on — `/posts/:slug`,
 * `/category/:slug`, `/tag/:slug` are fixed routes, and whatever prefix the
 * operator moved any of them to is served by the same catch-all. A collection on
 * one of these could never win the request.
 */
async function contentScreenSegments(): Promise<Set<string>> {
  const segments = new Set<string>([
    firstSegment(CONTENT_PATH_DEFAULTS.detail),
    firstSegment(CONTENT_PATH_DEFAULTS.category),
    firstSegment(CONTENT_PATH_DEFAULTS.tag),
  ])
  const configured = await new ContentPathsService().get()
  for (const value of Object.values(configured)) segments.add(firstSegment(value))
  return segments
}

/** The slug field a collection's public pages look records up by. */
export interface SlugFieldInfo {
  unique?: boolean
}

/** The slug field among `fields` (a SLUG-typed field first, else one keyed `slug`), or null. */
export function findSlugField<F extends { key: string; type: string; unique?: boolean }>(
  fields: F[]
): F | null {
  return fields.find((f) => f.type === 'SLUG') ?? fields.find((f) => f.key === 'slug') ?? null
}

/**
 * Validate the detail settings a collection would have after a write. Returns the
 * normalised settings, or throws a user-facing error.
 *
 * Turning the feature OFF is never blocked by the environment (a stale template,
 * a prefix the blog has since taken): only the shape and the one-collection-per-
 * prefix rule — which the database enforces — are checked, so an operator can
 * always switch it off and save unrelated changes.
 */
export async function assertDetailSettings(args: {
  /** Collection key, for error messages. */
  key: string
  /** Id of the collection being updated; absent on create. */
  selfId?: string
  type: string
  kind: string
  /** The collection's slug field (see `findSlugField`), or null when it has none. */
  slugField: SlugFieldInfo | null
  settings: DetailSettings
}): Promise<DetailSettings> {
  const { settings } = args
  const prefix = normalizeDetailPrefix(settings.prefix)

  if (!settings.on) {
    if (prefix) {
      assertPrefixFormat(prefix)
      await assertPrefixUnique(prefix, args.selfId)
    }
    return { on: false, prefix, pageId: settings.pageId || null }
  }

  if (args.type !== 'COLLECTION') {
    throw new DetailSettingsError('Public detail pages are only available on regular collections')
  }
  if (args.kind === 'single') {
    throw new DetailSettingsError(
      'Public detail pages need a collection with many records, not a single'
    )
  }
  if (!args.slugField) {
    throw new DetailSettingsError('Public detail pages need a slug field — add a SLUG field first')
  }
  // `unique` comes back as 1 from SQLite, true from Postgres.
  if (!args.slugField.unique) {
    throw new DetailSettingsError(
      'The slug field must be unique — each record is looked up by its slug, so two records may never share one. ' +
        'A field\'s uniqueness cannot be changed afterwards: add a new SLUG field with "Unique" on.'
    )
  }
  if (!prefix)
    throw new DetailSettingsError('Set a URL prefix for the detail pages, e.g. "portfolio"')
  await assertPrefixUsable(prefix, args.selfId)
  return { on: true, prefix, pageId: settings.pageId || null }
}

function assertPrefixFormat(prefix: string): void {
  if (prefix.length > PREFIX_MAX || !PREFIX.test(prefix)) {
    throw new DetailSettingsError(
      'The URL prefix must be a single segment of lowercase letters, numbers and dashes (e.g. "portfolio")'
    )
  }
}

async function assertPrefixUnique(prefix: string, selfId?: string): Promise<void> {
  const q = CmsCollection.query().where('detail_path_prefix', prefix).whereNull('deleted_at')
  if (selfId) q.whereNot('id', selfId)
  const taken = await q.first()
  if (taken)
    throw new DetailSettingsError(`"${prefix}" is already the detail prefix of "${taken.label}"`)
}

/** Everything that makes a prefix unusable for an ENABLED collection. Also used on restore. */
export async function assertPrefixUsable(prefix: string, selfId?: string): Promise<void> {
  assertPrefixFormat(prefix)
  const reserved = reservedFirstSegment(prefix)
  if (reserved)
    throw new DetailSettingsError(`"${reserved}" is reserved by the system — pick another prefix`)
  const blocked = await contentScreenSegments()
  if (blocked.has(prefix)) {
    throw new DetailSettingsError(
      `"${prefix}" is already used by the blog (posts, categories or tags) — pick another prefix`
    )
  }
  await assertPrefixUnique(prefix, selfId)
}

/**
 * The template page must be a live CODE/kit page — a builder page cannot render a
 * record. Checked where the operator picks it (admin API / MCP), NOT on data
 * import, where the page may not exist yet (collections import before pages).
 */
export async function assertTemplatePage(pageId: string | null | undefined): Promise<void> {
  if (!pageId) return
  const page = await Page.query().where('id', pageId).whereNull('deleted_at').first()
  if (!page) throw new DetailSettingsError('The detail template page does not exist')
  if (page.kind !== 'CODE') {
    throw new DetailSettingsError(
      'The detail template must be a custom-code (CODE/kit) page — a builder page cannot render a record'
    )
  }
}
