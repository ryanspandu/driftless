import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type User from '#models/user'

/** True when the account may still hold a session or an access token. */
export function isUserActive(user: Pick<User, 'status' | 'deletedAt'>): boolean {
  return user.deletedAt === null && user.status === 'ACTIVE'
}

/**
 * Ends the sessions of accounts that have been soft-deleted or deactivated.
 *
 * Both auth providers look a user up by primary key with no further conditions,
 * and `SessionLucidUserProviderOptions` / `AccessTokensLucidUserProviderOptions`
 * expose no place to add a filter — so a session (or a personal access token)
 * keeps working after `users.deleted_at` is stamped or `status` flips to
 * `INACTIVE`. Deleting a user therefore did not log them out.
 *
 * This runs in the router stack immediately after `silent_auth`, so the
 * offending session is cut on the very next request, before route handlers or
 * Inertia's shared props ever see the user.
 */
export default class ActiveUserMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // `auth.user` is a union across guards; narrow to the concrete model.
    const user = ctx.auth?.user as User | undefined

    if (user && !isUserActive(user)) {
      try {
        await ctx.auth.use('web').logout()
      } catch {
        // Not a session-authenticated request (e.g. a bearer token). The
        // credential is rejected by `auth_middleware` on the same request.
      }
    }

    return next()
  }
}
