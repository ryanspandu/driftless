import env from '#start/env'

/**
 * The site's public base URL, with any trailing slash removed.
 *
 * Prefers `APP_URL` (required in production); falls back to `localhost:PORT` for
 * local dev. Centralised here because it was duplicated ad hoc across the SEO
 * controller, the password-reset service and settings — anything that builds an
 * absolute URL (sitemap, canonical, JSON-LD, OAuth callbacks) should read it.
 */
export function siteUrl(): string {
  const port = env.get('PORT', 3333)
  return env.get('APP_URL', `http://localhost:${port}`).replace(/\/+$/, '')
}

/**
 * Turn a page path (with or without a leading slash) into an absolute URL.
 * A path that is already absolute (`http(s)://…`) is returned unchanged, so an
 * operator-entered canonical is never double-prefixed.
 */
export function absoluteUrl(pathOrUrl: string): string {
  const v = (pathOrUrl ?? '').trim()
  if (!v) return siteUrl()
  if (/^https?:\/\//i.test(v)) return v
  return `${siteUrl()}/${v.replace(/^\/+/, '')}`
}
