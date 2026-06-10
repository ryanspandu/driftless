import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'

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
      if (ctx.request.url().startsWith('/api/')) {
        return ctx.response.status(401).json({ message: 'Unauthorized' })
      }
      return ctx.response.redirect(this.redirectTo)
    }

    return next()
  }
}
