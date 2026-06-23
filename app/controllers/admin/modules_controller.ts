import type { HttpContext } from '@adonisjs/core/http'
import ModulesService from '#services/modules_service'

const modulesService = new ModulesService()

export default class ModulesController {
  /** Full module list with enabled state — drives the Settings panel toggle. */
  async index({ response }: HttpContext) {
    const modules = await modulesService.list()
    return response.json(modules)
  }

  /** Enabled modules' sidebar nav groups (any admin, no module:manage needed). */
  async menu({ response }: HttpContext) {
    const items = await modulesService.enabledMenu()
    return response.json(items)
  }

  /** Enable / disable a module at runtime (no restart). */
  async toggle({ params, request, response }: HttpContext) {
    const enabled = request.input('enabled')
    if (typeof enabled !== 'boolean') {
      return response.status(422).json({ message: '`enabled` must be a boolean.' })
    }
    try {
      const mod = await modulesService.setEnabled(params.name, enabled)
      return response.json(mod)
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }
}
