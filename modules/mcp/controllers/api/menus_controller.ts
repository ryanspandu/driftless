import type { HttpContext } from '@adonisjs/core/http'
import MenusService from '#services/menus_service'
import type { MenuItemInput } from '#services/menus_service'

const menus = new MenusService()

/**
 * Builder-API surface for the Menu Manager. Thin over `MenusService` (the
 * validation authority). Menu items are plain references, not Puck documents, so
 * no catalog validation applies. `set_menu_items` replaces a menu's whole tree.
 */
export default class BuilderMenusController {
  async index({ response }: HttpContext) {
    return response.json(await menus.list())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await menus.find(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async store({ request, response }: HttpContext) {
    const dto = request.only(['name', 'handle'])
    try {
      return response.status(201).json(await menus.create(dto))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async saveItems({ params, request, response }: HttpContext) {
    const items = (request.input('items', []) as MenuItemInput[]) ?? []
    try {
      return response.json(await menus.saveTree(params.id, items))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
