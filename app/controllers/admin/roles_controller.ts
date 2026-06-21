import type { HttpContext } from '@adonisjs/core/http'
import RolesService from '#services/roles_service'

const rolesService = new RolesService()

export default class RolesController {
  async index({ response }: HttpContext) {
    const roles = await rolesService.list()
    return response.json(roles)
  }

  async show({ params, response }: HttpContext) {
    const role = await rolesService.findOne(params.id)
    return response.json(role)
  }

  async store({ request, response }: HttpContext) {
    const { name, description, permissions } = request.all()
    try {
      const role = await rolesService.create({ name, description, permissions })
      return response.status(201).json(role)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { name, description, permissions } = request.all()
    try {
      const role = await rolesService.update(params.id, { name, description, permissions })
      return response.json(role)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await rolesService.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async trash({ response }: HttpContext) {
    const roles = await rolesService.findTrashed()
    return response.json(roles)
  }

  async restore({ params, response }: HttpContext) {
    try {
      const role = await rolesService.restore(params.id)
      return response.json(role)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async forceDestroy({ params, response }: HttpContext) {
    await rolesService.forceDelete(params.id)
    return response.json({ success: true })
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/roles', {})
  }

  async newPage({ inertia }: HttpContext) {
    return inertia.render('admin/roles/new', {})
  }

  async detailPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/roles/show', { roleId: params.id })
  }
}
