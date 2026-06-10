import User from '#models/user'
import Role from '#models/role'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import CaptchaService from '#services/captcha_service'
import { IntegrationSettingsService } from '#services/settings_service'

const signupValidator = vine.compile(
  vine.object({
    email: vine.string().email().maxLength(254),
    password: vine.string().minLength(8),
    username: vine.string().minLength(2).maxLength(64),
    firstName: vine.string().optional(),
    lastName: vine.string().optional(),
    fullName: vine.string().optional(),
  })
)

const integrationService = new IntegrationSettingsService()
const captchaService = new CaptchaService()

function signupFailure(response: HttpContext['response'], session: HttpContext['session'], message: string) {
  session.flash('error', message)
  return response.redirect().back()
}

export default class NewAccountController {
  async create({ inertia }: HttpContext) {
    const authConfig = await integrationService.getAuthPublicConfig()
    return inertia.render('auth/signup', { authConfig })
  }

  async store({ request, response, auth, session }: HttpContext) {
    let payload: Awaited<ReturnType<typeof signupValidator.validate>>
    try {
      payload = await request.validateUsing(signupValidator)
    } catch {
      return signupFailure(response, session, 'Invalid registration details')
    }

    const captchaToken = request.input('captchaToken')

    const row = await integrationService.getOrCreate()
    if (captchaService.isCaptchaEffective(row) && row.captchaOnRegister) {
      const ok = await captchaService.verifyToken(row, captchaToken, request.ip())
      if (!ok) {
        return signupFailure(response, session, 'CAPTCHA verification failed')
      }
    }

    const existingEmail = await User.query()
      .where('email', payload.email)
      .whereNull('deleted_at')
      .first()
    if (existingEmail) {
      return signupFailure(response, session, 'Email already registered')
    }

    const existingUsername = await User.query()
      .whereRaw('LOWER(username) = ?', [payload.username.toLowerCase()])
      .whereNull('deleted_at')
      .first()
    if (existingUsername) {
      return signupFailure(response, session, 'Username already taken')
    }

    const user = await User.create({
      email: payload.email,
      username: payload.username,
      password: payload.password,
      firstName: payload.firstName ?? null,
      lastName: payload.lastName ?? null,
      fullName: payload.fullName ?? null,
      status: 'ACTIVE',
    })

    const userRole = await Role.query().where('name', 'USER').whereNull('deleted_at').first()
    if (userRole) {
      await user.related('roles').attach([userRole.id])
    }

    await auth.use('web').login(user)
    return response.redirect('/admin/dashboard')
  }
}
