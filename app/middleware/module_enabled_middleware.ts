import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import ModulesService from '#services/modules_service'

const modules = new ModulesService()

/**
 * Guards module routes. Routes are always registered at boot; this checks the
 * (cached) enabled state per-request so a module can be toggled on/off from
 * Settings without a server restart. Disabled → 404 for API, redirect for pages.
 */
export default class ModuleEnabledMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { name: string }) {
    const enabled = await modules.isEnabled(options.name)
    if (enabled) {
      return next()
    }

    const { request, response } = ctx
    if (request.url().startsWith('/api')) {
      return response.notFound({ message: 'This module is disabled.' })
    }

    return response.redirect(request.url().startsWith('/admin') ? '/admin/settings' : '/')
  }
}
