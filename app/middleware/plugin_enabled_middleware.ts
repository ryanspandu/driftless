import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PluginsService from '#services/plugins_service'

const plugins = new PluginsService()

/**
 * Guards plugin routes. Routes are always registered at boot; this checks the
 * (cached) enabled state per-request so a plugin can be toggled on/off without
 * a server restart. Disabled → 404 for API, redirect for page requests.
 */
export default class PluginEnabledMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { name: string }) {
    const enabled = await plugins.isEnabled(options.name)
    if (enabled) {
      return next()
    }

    const { request, response } = ctx
    if (request.url().startsWith('/api')) {
      return response.notFound({ message: 'This plugin is disabled.' })
    }

    return response.redirect(request.url().startsWith('/admin') ? '/admin/plugins' : '/')
  }
}
