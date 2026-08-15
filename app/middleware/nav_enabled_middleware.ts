import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { Exception } from '@adonisjs/core/exceptions'
import { WebSettingsService } from '#services/settings_service'

const webSettings = new WebSettingsService()

/**
 * Maps core admin page prefixes to the sidebar nav title that controls them.
 * When that title is hidden (Settings → Application), the page 404s — not just
 * disappears from the sidebar. Only page routes are listed; API routes and the
 * dynamic CMS record pages (`/admin/cms/:key`) are intentionally left alone.
 */
const PATH_NAV: { prefix: string; nav: string }[] = [
  { prefix: '/admin/analytics', nav: 'Analytics' },
  { prefix: '/admin/content', nav: 'UI' },
  { prefix: '/admin/pages', nav: 'UI' },
  { prefix: '/admin/templates', nav: 'UI' },
  { prefix: '/admin/media', nav: 'Media' },
  { prefix: '/admin/cms/collections', nav: 'Collections' },
  /**
   * `/admin/integrations` is deliberately absent. It is reached from the
   * Settings hub rather than the sidebar, so there is no menu to hide — and
   * leaving it here meant hiding a menu entry silently 404'd the page a
   * still-visible Settings card linked to.
   */
  { prefix: '/admin/users', nav: 'User Management' },
  { prefix: '/admin/roles', nav: 'User Management' },
  { prefix: '/admin/permissions', nav: 'User Management' },
]

function navForPath(path: string): string | null {
  for (const m of PATH_NAV) {
    if (path === m.prefix || path.startsWith(m.prefix + '/')) return m.nav
  }
  return null
}

export default class NavEnabledMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const nav = navForPath(ctx.request.url())
    if (nav) {
      const { hiddenNav } = await webSettings.getAppConfig()
      if (hiddenNav.includes(nav)) {
        // Throw so the exception handler renders the dashboard 404 page — a
        // middleware that just returns an inertia render is not flushed to the
        // response, which is why the browser fell back to its native 404.
        throw new Exception('Page not found', { status: 404, code: 'E_NAV_HIDDEN' })
      }
    }
    return next()
  }
}
