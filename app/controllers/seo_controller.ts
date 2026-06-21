import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import ContentService from '#services/content_service'
import Page from '#models/page'

const contentService = new ContentService()

function siteUrl(): string {
  const port = env.get('PORT', 3333)
  return env.get('APP_URL', `http://localhost:${port}`).replace(/\/$/, '')
}

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
    const posts = await contentService.findPublishedList()
    const pages = await Page.query().where('status', 'PUBLISHED').whereNull('deleted_at')

    const entries = [
      { loc: `${base}/`, lastmod: new Date().toISOString() },
      ...posts.map((p) => ({
        loc: `${base}/posts/${encodeURIComponent(p.slug)}`,
        lastmod: p.updatedAt,
      })),
      ...pages.map((p) => ({
        loc: `${base}/${p.path.split('/').map(encodeURIComponent).join('/')}`,
        lastmod: p.updatedAt.toISO() ?? new Date().toISOString(),
      })),
    ]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod.split('T')[0]}</lastmod><changefreq>weekly</changefreq></url>`
  )
  .join('\n')}
</urlset>`

    return response.header('Content-Type', 'application/xml; charset=utf-8').send(xml)
  }
}
