import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import type User from '#models/user'
import { isUserActive } from '#middleware/active_user_middleware'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    const guards = options.guards ?? [ctx.auth.defaultGuard]
    const authed = await ctx.auth.checkUsing(guards)

    if (!authed) {
      return this.deny(ctx)
    }

    /**
     * Neither the session nor the access-token provider filters on
     * `deleted_at` / `status`, so a credential outlives the account it belongs
     * to. `active_user_middleware` cuts sessions globally; this catches the
     * token guard, which only resolves a user here.
     */
    const user = ctx.auth.user as User | undefined
    if (user && !isUserActive(user)) {
      return this.deny(ctx)
    }

    return next()
  }

  /** JSON for API routes, a redirect for everything else. */
  private deny(ctx: HttpContext) {
    if (ctx.request.url().startsWith('/api/')) {
      return ctx.response.status(401).json({ message: 'Unauthorized' })
    }
    return ctx.response.redirect(this.redirectTo)
  }
}
