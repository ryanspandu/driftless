import { Exception } from '@adonisjs/core/exceptions'
import User from '#models/user'
import Role from '#models/role'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import CaptchaService from '#services/captcha_service'
import { IntegrationSettingsService, WebSettingsService } from '#services/settings_service'
import { SELF_REGISTERED_ROLE } from '#database/seeder_constants'
import AuthPageOverrideService from '#services/auth_page_override_service'
import PageRenderer from '#services/page_renderer'

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
const webSettingsService = new WebSettingsService()
const overrides = new AuthPageOverrideService()
const renderer = new PageRenderer()

function signupFailure(
  response: HttpContext['response'],
  session: HttpContext['session'],
  message: string
) {
  session.flash('error', message)
  return response.redirect().back()
}

/**
 * Refuse the request unless an operator has opted into public signup.
 *
 * 404 rather than 403: a disabled signup endpoint should look like it does not
 * exist. Throwing (rather than returning) is required for the exception handler
 * to render the status page — a middleware/controller that returns an inertia
 * render from here would not be flushed.
 */
async function assertRegistrationOpen() {
  const { registrationEnabled } = await webSettingsService.getAppConfig()
  if (!registrationEnabled) {
    throw new Exception('Page not found', { status: 404, code: 'E_REGISTRATION_CLOSED' })
  }
}

export default class NewAccountController {
  async create(ctx: HttpContext) {
    /**
     * The gate runs *before* the override lookup. Closed registration has to
     * stay a 404 whichever screen would have been rendered — an override must
     * not become a way around the toggle.
     */
    await assertRegistrationOpen()

    const override = await overrides.resolve('register')
    if (override) {
      // See the note in `SessionController.create` for why `skipSnapshot`.
      return renderer.render(override, ctx, { skipSnapshot: true })
    }

    const authConfig = await integrationService.getAuthPublicConfig()
    return ctx.inertia.render('auth/signup', { authConfig })
  }

  async store({ request, response, auth, session }: HttpContext) {
    await assertRegistrationOpen()

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

    /**
     * Self-registered accounts get `MEMBER`, which holds no permissions at all.
     * They used to get `USER`, which carries `content:create/read/update/delete`
     * — so anyone who signed up could write and delete site content.
     *
     * A missing role (an install seeded before `MEMBER` existed) attaches
     * nothing, which is the safe outcome.
     */
    const memberRole = await Role.query()
      .where('name', SELF_REGISTERED_ROLE)
      .whereNull('deleted_at')
      .first()
    if (memberRole) {
      await user.related('roles').attach([memberRole.id])
    }

    await auth.use('web').login(user)
    // Not `/admin/dashboard`: a self-registered account has no admin
    // capabilities, so landing it in the admin shell is misleading.
    return response.redirect('/')
  }
}
