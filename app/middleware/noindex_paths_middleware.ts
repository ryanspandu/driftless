import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Path prefixes that must never be indexable — hardcoded, not a setting.
 *
 * Unlike `site_meta.discourage_indexing` (an opt-in, site-wide switch the
 * operator can flip from Website settings), this always sends
 * `X-Robots-Tag: noindex, nofollow` for anything under these prefixes: the
 * admin panel (including every module's admin pages, e.g. `/admin/ecommerce`,
 * `/admin/marketing/*`), its auth screens, and the storefront's
 * account/cart/checkout/order screens. None of it has SEO value, and an
 * operator must not be able to accidentally expose it by editing the
 * robots.txt override or leaving `discourage_indexing` off — this is global
 * middleware, independent of both.
 *
 * Storefront catalogue pages (`/shop`, `/shop/p/:slug`, `/shop/category/:slug`,
 * `/shop/tag/:slug`) are deliberately NOT here — those are the whole point of
 * a storefront's SEO and must stay indexable.
 */
const NOINDEX_PREFIXES = [
  '/admin',
  '/api/admin',
  '/login',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/login',
  '/auth/signup',
  '/auth/register',
  '/offline',
  '/shop/account',
  '/shop/cart',
  '/shop/checkout',
  '/shop/order',
  '/shop/unsubscribe',
  '/shop/download',
  /** A product's outbound affiliate-CTA redirector — no content, no SEO value. */
  '/out',
]

function isNoindexPath(path: string): boolean {
  return NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export default class NoindexPathsMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (isNoindexPath(request.url())) {
      response.header('X-Robots-Tag', 'noindex, nofollow')
    }
    return next()
  }
}
