import type { HttpContext } from '@adonisjs/core/http'
import PermissionsService from '#services/permissions_service'

const permissionsService = new PermissionsService()

export default class PermissionsController {
  async index({ response }: HttpContext) {
    const perms = await permissionsService.list()
    return response.json(perms)
  }

  async show({ params, response }: HttpContext) {
    const perm = await permissionsService.findOne(params.id)
    return response.json(perm)
  }

  async store({ request, response }: HttpContext) {
    const { name, description } = request.all()
    try {
      const perm = await permissionsService.create({ name, description })
      return response.status(201).json(perm)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const { name, description } = request.all()
    try {
      const perm = await permissionsService.update(params.id, { name, description })
      return response.json(perm)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await permissionsService.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async trash({ response }: HttpContext) {
    const perms = await permissionsService.findTrashed()
    return response.json(perms)
  }

  async restore({ params, response }: HttpContext) {
    try {
      const perm = await permissionsService.restore(params.id)
      return response.json(perm)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async forceDestroy({ params, response }: HttpContext) {
    await permissionsService.forceDelete(params.id)
    return response.json({ success: true })
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/permissions', {})
  }

  async newPage({ inertia }: HttpContext) {
    return inertia.render('admin/permissions/new', {})
  }

  async detailPage({ params, inertia }: HttpContext) {
    return inertia.render('admin/permissions/show', { permissionId: params.id })
  }
}
