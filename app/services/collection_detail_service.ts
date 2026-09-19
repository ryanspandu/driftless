import CmsCollection from '#models/cms_collection'
import Page from '#models/page'
import CmsService, { type CmsCollectionDto, type CmsRecordDto } from '#services/cms_service'
import TemplateKitsService from '#services/template_kits_service'
import type { RenderPageOptions } from '#services/page_renderer'
import type { SitemapEntry } from '#services/sitemap_registry'
import { recordLabel } from '#cms/field_values'
import { excerptOf } from '#cms/builtin_collections'
import { absoluteUrl, siteUrl } from '#helpers/site_url'

const cms = new CmsService()
const templateKits = new TemplateKitsService()

/** Field keys tried, in order, for the record's meta description / social image. */
const DESCRIPTION_KEYS = ['seo_description', 'description', 'summary', 'excerpt', 'subtitle']
const IMAGE_KEYS = ['seo_image', 'og_image', 'image', 'featured_image', 'cover', 'thumbnail']

/** Sitemap protocol limit per file. */
const SITEMAP_CAP = 50_000

export interface CollectionDetailHit {
  /** The CODE/kit template page to render the record through. */
  page: Page
  options: RenderPageOptions
}

/**
 * A record's `updatedAt` as an ISO string. The dynamic tables are read with the
 * raw driver, so Postgres hands back a `Date` where SQLite hands back a string.
 */
function toIso(value: unknown): string | undefined {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = data[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/**
 * Title, description and image for a record's `<head>`, by convention over the
 * collection's field keys, so a template page's single SEO block does not stamp
 * every record with the same title.
 */
function seoFor(record: CmsRecordDto, collection: CmsCollectionDto, canonicalPath: string) {
  const data = (record.data ?? {}) as Record<string, unknown>
  const description = pickString(data, DESCRIPTION_KEYS)
  const image =
    pickString(data, IMAGE_KEYS) ??
    // Else the first MEDIA field with a value (already a URL after resolution).
    collection.fields
      .filter((f) => f.type === 'MEDIA')
      .map((f) => data[f.key])
      .find((v): v is string => typeof v === 'string' && v.length > 0) ??
    null
  return {
    title: recordLabel(record),
    description: description ? excerptOf(description, 200) : null,
    // The renderer absolutises the canonical but not the image.
    imageUrl: image ? absoluteUrl(image) : null,
    canonicalPath,
  }
}

/**
 * Public detail pages for a collection: `/<prefix>/<slug>` renders one PUBLISHED
 * record through a template page, with no Page row per record.
 *
 * Resolved inside the CMS catch-all (`PagesPublicController.show`) because routes
 * are frozen at boot and a `/:prefix/:slug` route would shadow every two-segment
 * page. A page (or file-page) on the exact path still wins; this runs before the
 * redirect and 404 fallbacks. Every unhealthy state — collection off, no such
 * record, template missing/draft/not CODE, kit inactive — is a plain 404 (there
 * is no built-in screen to fall back to).
 *
 * The lookup is one indexed query, only for a two-segment path that already
 * missed every page, so it is not cached (a cache would go stale across workers).
 */
export default class CollectionDetailService {
  async resolve(path: string): Promise<CollectionDetailHit | null> {
    const [prefix, rawSlug, ...rest] = path.split('/')
    if (!prefix || !rawSlug || rest.length > 0) return null

    const collection = await CmsCollection.query()
      .where('detail_pages_on', true)
      .where('detail_path_prefix', prefix)
      .whereNull('deleted_at')
      .first()
    if (!collection?.detailPageId) return null

    const template = await this.templateFor(collection)
    if (!template) return null

    let slug = rawSlug
    try {
      slug = decodeURIComponent(rawSlug)
    } catch {
      // keep the raw segment
    }
    const found = await cms.findPublishedRecordBySlug(collection.key, slug)
    if (!found) return null
    // The record is handed to a kit as props. Postgres returns timestamps and DATE
    // fields as `Date` objects (SQLite as strings), so a kit doing `item.createdAt.slice()`
    // would crash SSR on one database only — normalise through JSON, like the
    // props are on their way to the browser anyway.
    const record = JSON.parse(JSON.stringify(found)) as typeof found
    const dto = await cms.findCollection(collection.key)

    return {
      page: template,
      options: {
        bindings: { params: { collection: collection.key, slug } },
        record: { collection: collection.key, item: record } as unknown as Record<string, unknown>,
        seoOverride: seoFor(record, dto, `/${prefix}/${rawSlug}`),
        // The snapshot is keyed on the template page; caching one record's render
        // would serve it for every other record.
        skipSnapshot: true,
      },
    }
  }

  /** The live CODE/kit template page of a collection, or null. */
  private async templateFor(collection: CmsCollection): Promise<Page | null> {
    if (!collection.detailPageId) return null
    const page = await Page.query()
      .where('id', collection.detailPageId)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()
    // A builder page cannot render a record (`record` is CODE-only).
    if (!page || page.kind !== 'CODE') return null
    const kit = page.component?.startsWith('kit:') ? page.component.slice(4) : null
    if (kit) {
      const active = await templateKits.activeSet()
      if (!active.has(kit)) return null
    }
    return page
  }

  /** Every healthy collection's published record URLs, for `/sitemap.xml`. */
  async sitemapEntries(): Promise<SitemapEntry[]> {
    const collections = await CmsCollection.query()
      .where('detail_pages_on', true)
      .whereNotNull('detail_path_prefix')
      .whereNull('deleted_at')
    const entries: SitemapEntry[] = []
    for (const collection of collections) {
      const room = SITEMAP_CAP - entries.length
      if (room <= 0) break
      if (!(await this.templateFor(collection))) continue
      // One narrow query per collection (slug + timestamp only), capped.
      const rows = await cms.publishedSlugEntries(collection.key, room)
      for (const row of rows) {
        entries.push({
          loc: `${siteUrl()}/${collection.detailPathPrefix}/${encodeURIComponent(row.slug)}`,
          lastmod: toIso(row.updatedAt),
        })
      }
    }
    return entries
  }
}
