import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import { collectUserPermissions } from '#services/permission_ability_service'
import { WebSettingsService } from '#services/settings_service'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'

const webSettings = new WebSettingsService()

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    /**
     * The share method is called everytime an Inertia page is rendered. In
     * certain cases, a page may get rendered before the session middleware
     * or the auth middleware are executed. For example: During a 404 request.
     *
     * In that case, we must always assume that HttpContext is not fully hydrated
     * with all the properties
     */
    const { session, auth } = ctx as Partial<HttpContext>

    /**
     * Fetching the first error from the flash messages
     */
    const error = session?.flashMessages.get('error') as string
    const success = session?.flashMessages.get('success') as string

    const siteTheme = await webSettings.getPublicTheme()

    /**
     * Data shared with all Inertia pages. Make sure you are using
     * transformers for rich data-types like Models.
     */
    return {
      errors: ctx.inertia.always(this.getValidationErrors(ctx)),
      flash: ctx.inertia.always({
        error,
        success,
      }),
      user: ctx.inertia.always(auth?.user ? UserTransformer.transform(auth.user) : undefined),
      permissions: ctx.inertia.always(auth?.user ? collectUserPermissions(auth.user) : []),
      // Shield generates this before Inertia renders. Trusted settings-managed
      // snippets consume it so CSP never needs unsafe-inline for scripts.
      cspNonce: ctx.inertia.always(ctx.response.nonce),
      // Public font/colour theme, injected as a `.theme-light`-scoped <style> in
      // `layout-shell` (public + storefront only).
      siteTheme: ctx.inertia.always({ ...siteTheme }),
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.auth?.user) {
      // Narrow the cross-guard union to the concrete model for relation typing.
      await (ctx.auth.user as User).load('roles', (q) => q.preload('permissions'))
    }
    await this.init(ctx)

    const output = await next()
    this.dispose(ctx)

    return output
  }
}

declare module '@adonisjs/inertia/types' {
  type MiddlewareSharedProps = InferSharedProps<InertiaMiddleware>
  export interface SharedProps extends MiddlewareSharedProps {}
}
