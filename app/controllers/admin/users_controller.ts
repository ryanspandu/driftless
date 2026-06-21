import type { HttpContext } from '@adonisjs/core/http'
import UsersService from '#services/users_service'
import vine from '@vinejs/vine'

const usersService = new UsersService()

const createUserValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string().minLength(8),
    username: vine.string().minLength(2).optional(),
    firstName: vine.string().optional(),
    lastName: vine.string().optional(),
    fullName: vine.string().optional(),
    status: vine.enum(['ACTIVE', 'INACTIVE']).optional(),
    roles: vine.array(vine.string()).optional(),
  })
)

const updateUserValidator = vine.compile(
  vine.object({
    email: vine.string().email().optional(),
    password: vine.string().minLength(8).optional(),
    username: vine.string().minLength(2).optional(),
    firstName: vine.string().optional(),
    lastName: vine.string().optional(),
    fullName: vine.string().optional(),
    status: vine.enum(['ACTIVE', 'INACTIVE']).optional(),
    roles: vine.array(vine.string()).optional(),
  })
)

export default class UsersController {
  async index({ request, response }: HttpContext) {
    const { page, pageSize, search, role, status } = request.qs()
    const result = await usersService.paginate({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      search,
      role: role ? [role] : undefined,
      status,
    })
    return response.json(result)
  }

  async show({ params, response }: HttpContext) {
    const user = await usersService.findOne(Number(params.id))
    return response.json(user)
  }

  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createUserValidator)
    try {
      const user = await usersService.create(payload)
      return response.status(201).json(user)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(updateUserValidator)
    try {
      const user = await usersService.update(Number(params.id), payload)
      return response.json(user)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, auth, response }: HttpContext) {
    try {
      await usersService.remove(Number(params.id), auth.user!.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async trash({ response }: HttpContext) {
    const items = await usersService.findTrashed()
    return response.json(items)
  }

  async restore({ params, response }: HttpContext) {
    try {
      const user = await usersService.restore(Number(params.id))
      return response.json(user)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async forceDestroy({ params, response }: HttpContext) {
    await usersService.forceDelete(Number(params.id))
    return response.json({ success: true })
  }

  async generatePassword({ response }: HttpContext) {
    const password = usersService.generatePassword()
    return response.json({ password })
  }

  async page({ inertia }: HttpContext) {
    return inertia.render('admin/users', {})
  }
}
