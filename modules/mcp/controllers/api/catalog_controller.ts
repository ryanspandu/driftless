import type { HttpContext } from '@adonisjs/core/http'
import { loadCatalog, type CatalogTarget } from '#modules/mcp/services/block_catalog'
import ModulesService from '#services/modules_service'
import { WebSettingsService } from '#services/settings_service'

const TARGETS: CatalogTarget[] = ['page', 'collection', 'email']

/**
 * Serves the machine-readable block catalog an AI client reads before it
 * composes a Puck document. Thin: the JSON is emitted by `node ace mcp:catalog`
 * and only loaded here.
 */
export default class CatalogController {
  async show({ request, response }: HttpContext) {
    const raw = String(request.input('type', 'page'))
    const target = (TARGETS.includes(raw as CatalogTarget) ? raw : 'page') as CatalogTarget
    const catalog = await loadCatalog(target)
    if (!catalog) {
      return response.status(503).json({
        message: `Block catalog for "${target}" is not available yet. Run: node ace mcp:catalog`,
      })
    }
    // Annotate with the modules enabled RIGHT NOW, so the AI can tell which
    // module blocks will actually render (a static catalog file can't know this).
    const enabledMap = await new ModulesService().enabledMap()
    const enabledModules = [...enabledMap.entries()].filter(([, on]) => on).map(([name]) => name)
    // Attach the live theme + EFFECTIVE colours so the AI knows what
    // `variant:"primary"` / product CTAs render as (default purple on an
    // unthemed site) and can decide to call set_appearance to match a design.
    const theme = await new WebSettingsService().getAppearance()
    return response.json({ ...catalog, enabledModules, theme })
  }
}
