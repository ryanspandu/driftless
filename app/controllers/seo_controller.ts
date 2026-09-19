import type { HttpContext } from '@adonisjs/core/http'
import ContentService from '#services/content_service'
import Page from '#models/page'
import { siteUrl } from '#helpers/site_url'
import { collectSitemapEntries } from '#services/sitemap_registry'
import { WebSettingsService } from '#services/settings_service'
import { renderAiCrawlerBlock, type AiCrawlerGroup } from '#services/ai_crawlers'
import { PAGE_ROLE_SLOTS } from '#services/page_role_slots'
import ModulesService from '#services/modules_service'
import ContentPathsService from '#services/content_paths_service'
import CmsCollection from '#models/cms_collection'

const contentService = new ContentService()
const contentPaths = new ContentPathsService()
const webSettingsService = new WebSettingsService()
const modulesService = new ModulesService()

/**
 * Every page id currently standing in for a built-in screen (home, login,
 * post detail, cart, checkout, ...) — core role slots plus the ecommerce
 * module's own. A role page is a TEMPLATE served at a fixed URL that has
 * nothing to do with its own `path` column (see `page_renderer.ts`'s
 * canonical-URL comment for the same distinction); listing it a second time
 * at its raw slug in the sitemap is duplicate/junk content, not a real page.
 */
async function rolePageIds(sections: Record<string, Record<string, string>>): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const { section, key } of PAGE_ROLE_SLOTS) {
    const id = sections[section]?.[key]?.trim()
    if (id) ids.add(id)
  }

  // A collection's public detail template renders every record — its own path
  // is not a real page either.
  // (a failed lookup — e.g. the migration has not run yet — just hides nothing)
  const detailTemplates = await CmsCollection.query()
    .where('detail_pages_on', true)
    .whereNotNull('detail_page_id')
    .whereNull('deleted_at')
    .select('detail_page_id')
    .catch(() => [] as CmsCollection[])
  for (const c of detailTemplates) {
    if (c.detailPageId) ids.add(c.detailPageId)
  }

  if (await modulesService.isEnabled('ecommerce')) {
    const { default: EcommerceSetting } = await import('#modules/ecommerce/models/setting')
    const store = await EcommerceSetting.find('default')
    if (store) {
      for (const id of [
        store.productPageId,
        store.shopPageId,
        store.cartPageId,
        store.checkoutPageId,
        store.orderPageId,
        store.accountPageId,
        store.loginPageId,
        store.registerPageId,
        store.categoryPageId,
        store.tagPageId,
      ]) {
        if (id) ids.add(id)
      }
    }
  }

  return ids
}

export default class SeoController {
  async robots({ response }: HttpContext) {
    const sections = await webSettingsService.getMergedSections()
    const sm = sections['site_meta'] ?? {}

    // A full raw override wins outright — the AI-crawler toggles below never
    // apply while a custom robots.txt is set. Only the emptiness check is
    // trimmed; the served body is the operator's exact stored text.
    const override = sm['custom_robots_txt'] ?? ''
    if (override.trim()) {
      return response.header('Content-Type', 'text/plain; charset=utf-8').send(override)
    }

    const base = siteUrl()
    const groups: AiCrawlerGroup[] = []
    if (sm['block_ai_training'] === '1') groups.push('training')
    if (sm['block_ai_search'] === '1') groups.push('search')
    if (sm['block_ai_agents'] === '1') groups.push('agents')
    const aiBlocks = groups.map(renderAiCrawlerBlock).join('\n\n')

    const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/
Disallow: /login
Disallow: /register
Disallow: /offline
Disallow: /api/
${aiBlocks ? `\n${aiBlocks}\n` : ''}
Sitemap: ${base}/sitemap.xml
Host: ${base}
`
    return response.header('Content-Type', 'text/plain; charset=utf-8').send(body)
  }

  async sitemap({ response }: HttpContext) {
    const base = siteUrl()
    const now = new Date().toISOString()

    const sections = await webSettingsService.getMergedSections()

    // No point listing pages the operator is telling search engines not to
    // index — an empty sitemap is a less contradictory signal, and it skips
    // the DB reads below entirely.
    let entries: { loc: string; lastmod: string }[] = []
    if (sections['site_meta']?.['discourage_indexing'] !== '1') {
      const posts = await contentService.findPublishedList()
      const paths = await contentPaths.get()
      const postPrefix = paths.detail
      const pages = await Page.query().where('status', 'PUBLISHED').whereNull('deleted_at')
      // Module-contributed URLs (e.g. e-commerce product pages).
      const contributed = await collectSitemapEntries()
      const rolePages = await rolePageIds(sections)

      entries = [
        { loc: `${base}/`, lastmod: now },
        ...posts.map((p) => ({
          loc: `${base}/${postPrefix}/${encodeURIComponent(p.slug)}`,
          lastmod: p.updatedAt,
        })),
        ...pages
          // Skip pages the operator asked search engines not to index —
          // listing a noindex URL in the sitemap is a contradictory signal.
          .filter((p) => (p.seo as { noindex?: unknown } | null)?.noindex !== true)
          // Skip pages standing in for a built-in screen (home, cart, post
          // detail, ...) — their raw `path` is a template, not a real URL;
          // the screen's actual canonical URL (if indexable at all) is
          // contributed separately (the `/` entry above, or a module's own
          // `collectSitemapEntries()`).
          .filter((p) => !rolePages.has(p.id))
          .map((p) => ({
            loc: `${base}/${p.path.split('/').map(encodeURIComponent).join('/')}`,
            lastmod: p.updatedAt.toISO() ?? now,
          })),
        ...contributed.map((e) => ({ loc: e.loc, lastmod: e.lastmod ?? now })),
      ]
    }

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
