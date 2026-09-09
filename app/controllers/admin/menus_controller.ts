import type { HttpContext } from '@adonisjs/core/http'
import MenusService from '#services/menus_service'
import type { MenuItemInput } from '#services/menus_service'

const menusService = new MenusService()

export default class MenusController {
  /** Inertia shell for the menu list. */
  async page({ inertia }: HttpContext) {
    return inertia.render('admin/menus/index', {})
  }

  /** Inertia shell for the single-menu tree builder. */
  async edit({ params, inertia }: HttpContext) {
    return inertia.render('admin/menus/builder', { id: params.id })
  }

  async index({ response }: HttpContext) {
    return response.json(await menusService.list())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await menusService.find(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async store({ request, response }: HttpContext) {
    const { name, handle } = request.only(['name', 'handle'])
    try {
      const menu = await menusService.create({ name, handle })
      return response.status(201).json(menu)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { name, handle } = request.only(['name', 'handle'])
    try {
      return response.json(await menusService.update(params.id, { name, handle }))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Replace the whole item tree for a menu. */
  async saveItems({ params, request, response }: HttpContext) {
    const items = (request.input('items', []) as MenuItemInput[]) ?? []
    try {
      return response.json(await menusService.saveTree(params.id, items))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await menusService.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async trash({ response }: HttpContext) {
    return response.json(await menusService.findTrashed())
  }

  async restore({ params, response }: HttpContext) {
    try {
      return response.json(await menusService.restore(params.id))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async forceDestroy({ params, response }: HttpContext) {
    try {
      await menusService.forceDelete(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
