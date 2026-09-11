import { Exception } from '@adonisjs/core/exceptions'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type User from '#models/user'
import { abilityAllowsCode, collectUserPermissions } from '#services/permission_ability_service'

/**
 * Permission guard for **page** (Inertia/HTML) routes.
 *
 * `require_permission_middleware` always answers with JSON — correct for
 * `/api/*`, wrong for a browser navigation, which is why admin page routes
 * historically carried `auth()` only and left gating to the client. That leaves
 * the React shell for privileged screens loadable by any signed-in user; the
 * APIs behind it still 403, so it is an information leak rather than data
 * access, but pages that deal with money should not be reachable at all.
 *
 * This middleware throws a 404 instead of rendering a 403. Two reasons:
 * a middleware that *returns* an inertia render is not flushed to the response
 * (the same constraint `nav_enabled_middleware` documents), and 404 does not
 * confirm to an unauthorised user that the route exists.
 */
export default class RequirePagePermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { permission: string }) {
    // `auth.user` is a union across guards (session + api token); narrow to the
    // concrete model so relation methods (`.load`) type correctly.
    const user = ctx.auth.user as User | undefined
    if (!user) {
      return ctx.response.redirect('/login')
    }

    await user.load('roles', (q) => q.preload('permissions'))
    const permissions = collectUserPermissions(user)

    if (!abilityAllowsCode(permissions, options.permission)) {
      throw new Exception('Page not found', { status: 404, code: 'E_PAGE_FORBIDDEN' })
    }

    return next()
  }
}
