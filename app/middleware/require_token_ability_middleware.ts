import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type User from '#models/user'
import type { AccessToken } from '@adonisjs/auth/access_tokens'

/**
 * Enforces that the request was authenticated with an access token that holds
 * the required ability. This is the token-scope half of the layered access
 * model — RBAC (require_permission_middleware) still applies on top of it, so
 * effective access = token abilities ∩ owner permissions.
 *
 * `AccessToken.allows(ability)` is built-in and honors the `*` wildcard.
 */
export default class RequireTokenAbilityMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { ability: string }) {
    const user = ctx.auth.user as (User & { currentAccessToken?: AccessToken }) | undefined

    if (!user || !user.currentAccessToken) {
      return ctx.response.status(401).json({ message: 'Unauthorized' })
    }

    if (!user.currentAccessToken.allows(options.ability)) {
      return ctx.response.status(403).json({ message: 'Forbidden' })
    }

    return next()
  }
}
