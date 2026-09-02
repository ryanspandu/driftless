import type { HttpContext } from '@adonisjs/core/http'
import ContentService from '#services/content_service'
import Page from '#models/page'
import { siteUrl } from '#helpers/site_url'
import { collectSitemapEntries } from '#services/sitemap_registry'

const contentService = new ContentService()

export default class SeoController {
  async robots({ response }: HttpContext) {
    const base = siteUrl()
    const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /login
Disallow: /register
Disallow: /offline
Disallow: /api/

Sitemap: ${base}/sitemap.xml
Host: ${base}
`
    return response.header('Content-Type', 'text/plain; charset=utf-8').send(body)
  }

  async sitemap({ response }: HttpContext) {
    const base = siteUrl()
    const now = new Date().toISOString()
    const posts = await contentService.findPublishedList()
    const pages = await Page.query().where('status', 'PUBLISHED').whereNull('deleted_at')
    // Module-contributed URLs (e.g. e-commerce product pages).
    const contributed = await collectSitemapEntries()

    const entries: { loc: string; lastmod: string }[] = [
      { loc: `${base}/`, lastmod: now },
      ...posts.map((p) => ({
        loc: `${base}/posts/${encodeURIComponent(p.slug)}`,
        lastmod: p.updatedAt,
      })),
      // Skip pages the operator asked search engines not to index — listing a
      // noindex URL in the sitemap is a contradictory signal.
      ...pages
        .filter((p) => (p.seo as { noindex?: unknown } | null)?.noindex !== true)
        .map((p) => ({
          loc: `${base}/${p.path.split('/').map(encodeURIComponent).join('/')}`,
          lastmod: p.updatedAt.toISO() ?? now,
        })),
      ...contributed.map((e) => ({ loc: e.loc, lastmod: e.lastmod ?? now })),
    ]

    // De-dupe by loc (a contributed URL may also be a Page); first wins.
    const seen = new Set<string>()
    const unique = entries.filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)))

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique
  .map(
    (e) =>
      `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod.split('T')[0]}</lastmod><changefreq>weekly</changefreq></url>`
  )
  .join('\n')}
</urlset>`

    return response.header('Content-Type', 'application/xml; charset=utf-8').send(xml)
  }
}
