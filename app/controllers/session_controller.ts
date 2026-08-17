import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import CaptchaService from '#services/captcha_service'
import { IntegrationSettingsService } from '#services/settings_service'
import { collectUserPermissions } from '#services/permission_ability_service'
import UserAuthService from '#services/user_auth_service'
import AuthPageOverrideService from '#services/auth_page_override_service'
import PageRenderer from '#services/page_renderer'

const integrationService = new IntegrationSettingsService()
const captchaService = new CaptchaService()
const overrides = new AuthPageOverrideService()
const renderer = new PageRenderer()

function authFailure(response: HttpContext['response'], session: HttpContext['session'], message: string) {
  session.flash('error', message)
  return response.redirect().back()
}

export default class SessionController {
  /**
   * The sign-in screen — a builder page when one is designated, else the
   * built-in component.
   *
   * Only this GET branches. `store` below is untouched, so every credential
   * check, throttle and CAPTCHA rule applies identically whichever screen the
   * form was rendered from.
   */
  async create(ctx: HttpContext) {
    const override = await overrides.resolve('login')
    if (override) {
      /**
       * `skipSnapshot` because this page is being served at `/login`, not at
       * its own path. Without it the SSG cache — which is keyed on the page —
       * would be written here and then served for the page's public URL, and
       * could freeze one visitor's flashed error message into it. It also
       * forces `Cache-Control: no-store`, which is what a credential screen
       * wants anyway.
       */
      return renderer.render(override, ctx, { skipSnapshot: true })
    }

    const authConfig = await integrationService.getAuthPublicConfig()
    return ctx.inertia.render('auth/login', { authConfig })
  }

  async store({ request, auth, response, session }: HttpContext) {
    const login = String(request.input('login') ?? request.input('email') ?? '').trim()
    const password = String(request.input('password') ?? '')
    const captchaToken = request.input('captchaToken')

    const row = await integrationService.getOrCreate()
    if (captchaService.isCaptchaEffective(row) && row.captchaOnLogin) {
      const ok = await captchaService.verifyToken(row, captchaToken, request.ip())
      if (!ok) {
        return authFailure(response, session, 'CAPTCHA verification failed')
      }
    }

    if (!login || !password) {
      return authFailure(response, session, 'Invalid credentials')
    }

    try {
      const user = await UserAuthService.verifyCredentialsForLogin(login, password)
      if (user.status === 'INACTIVE') {
        return authFailure(response, session, 'Account inactive')
      }
      await auth.use('web').login(user)
      return response.redirect('/admin/dashboard')
    } catch {
      return authFailure(response, session, 'Invalid credentials')
    }
  }

  async destroy({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect('/login')
  }

  async me({ auth, response }: HttpContext) {
    // `auth.user` is a union across guards (session + api token); narrow to the
    // concrete model so relation methods (`.load`) type correctly.
    const user = auth.user! as User
    await user.load('roles', (q) => q.preload('permissions'))

    return response.json({
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      status: user.status,
      roles: user.roles?.map((r) => r.name) ?? [],
      permissions: collectUserPermissions(user),
    })
  }

  async updateProfile({ auth, request, response }: HttpContext) {
    const user = auth.user!
    const { firstName, lastName, username, phone, address, email } = request.all()

    if (username && username !== user.username) {
      const taken = await User.query()
        .where('username', username)
        .whereNull('deleted_at')
        .whereNot('id', user.id)
        .first()
      if (taken) return response.status(422).json({ message: 'Username already taken' })
      user.username = username
    }

    if (email && email !== user.email) {
      const normalized = String(email).trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return response.status(422).json({ message: 'Invalid email address' })
      }
      const taken = await User.query()
        .whereRaw('LOWER(email) = ?', [normalized.toLowerCase()])
        .whereNull('deleted_at')
        .whereNot('id', user.id)
        .first()
      if (taken) return response.status(422).json({ message: 'Email already in use' })
      user.email = normalized
    }

    if (firstName !== undefined) user.firstName = firstName
    if (lastName !== undefined) user.lastName = lastName
    if (phone !== undefined) user.phone = phone
    if (address !== undefined) user.address = address
    user.fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.fullName

    await user.save()
    return response.json({ success: true })
  }
}
