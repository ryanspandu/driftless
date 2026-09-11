import type { HttpContext } from '@adonisjs/core/http'
import MenusService from '#services/menus_service'

const menusService = new MenusService()

/**
 * Public read for a resolved menu tree, by handle. Backs the `MenuBar` block's
 * client-side fallback on CSR/preview pages, where the server-resolved block
 * data context is empty. Returns 404 when no live menu has that handle.
 */
export default class PublicMenusController {
  async show({ params, response }: HttpContext) {
    const menu = await menusService.resolveByHandle(params.handle)
    if (!menu) return response.status(404).json({ message: 'Menu not found' })
    return response.json(menu)
  }
}
