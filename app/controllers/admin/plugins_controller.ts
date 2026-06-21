import type { HttpContext } from '@adonisjs/core/http'
import PluginsService from '#services/plugins_service'
import { renderPage } from '#helpers/inertia_render'

const pluginsService = new PluginsService()

export default class PluginsController {
  /** Management page (DataTable + active toggle). */
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'admin/plugins', {})
  }

  /** Full plugin list with enabled state — drives the management table. */
  async index({ response }: HttpContext) {
    const plugins = await pluginsService.list()
    return response.json(plugins)
  }

  /** Enabled plugins' sidebar menu entries (any admin, no plugin:manage needed). */
  async menu({ response }: HttpContext) {
    const items = await pluginsService.enabledMenu()
    return response.json(items)
  }

  /** Enable / disable a plugin at runtime (no restart). */
  async toggle({ params, request, response }: HttpContext) {
    const enabled = request.input('enabled')
    if (typeof enabled !== 'boolean') {
      return response.status(422).json({ message: '`enabled` must be a boolean.' })
    }
    try {
      const plugin = await pluginsService.setEnabled(params.name, enabled)
      return response.json(plugin)
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }
}
