/**
 * A registry of extra sitemap URL sources.
 *
 * The core sitemap knows about `Page` rows and blog posts, but modules serve
 * their own indexable URLs off shared template pages — an e-commerce product at
 * `/shop/p/:slug` is a real page Google should crawl, yet it is not a `Page`
 * row. Rather than have core import a module by name (the exact coupling the
 * renderer avoids), a module registers a source here from its `boot()` hook and
 * the sitemap controller folds them all in.
 *
 * Sources return absolute `loc` URLs (build them with `siteUrl()`); a throwing
 * or slow source must never break the sitemap, so `collectSitemapEntries`
 * isolates each one.
 */

export interface SitemapEntry {
  loc: string
  /** ISO timestamp; the controller emits the date part. */
  lastmod?: string
}

type SitemapSource = () => Promise<SitemapEntry[]>

const sources = new Map<string, SitemapSource>()

/** Register (or replace) a named source. Named so a module re-boot is idempotent. */
export function registerSitemapSource(name: string, source: SitemapSource): void {
  sources.set(name, source)
}

export async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const results = await Promise.all(
    [...sources.values()].map((s) => s().catch(() => [] as SitemapEntry[]))
  )
  return results.flat()
}
