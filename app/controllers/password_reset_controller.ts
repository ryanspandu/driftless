import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import PasswordResetService from '#services/password_reset_service'
import AuthPageOverrideService from '#services/auth_page_override_service'
import PageRenderer from '#services/page_renderer'
import { renderPage } from '#helpers/inertia_render'

const service = new PasswordResetService()
const overrides = new AuthPageOverrideService()
const renderer = new PageRenderer()

const requestValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().maxLength(254),
  })
)

const resetValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1).maxLength(255),
    password: vine.string().minLength(8).maxLength(255),
    passwordConfirmation: vine.string().confirmed({ confirmationField: 'password' }).optional(),
  })
)

/**
 * The same sentence whether or not the address belongs to an account.
 *
 * Any difference here — wording, status code, a redirect target — turns the
 * form into a "does this person have an account" oracle, which is the whole
 * reason the service returns nothing to branch on.
 */
const GENERIC_SENT = 'If that email is registered, a reset link is on its way.'

export default class PasswordResetController {
  /** The "enter your email" form — a builder page when one is designated. */
  async create(ctx: HttpContext) {
    const override = await overrides.resolve('forgotPassword')
    if (override) {
      // See the note in `SessionController.create` for why `skipSnapshot`.
      return renderer.render(override, ctx, { skipSnapshot: true })
    }
    return renderPage(ctx.inertia, 'auth/forgot-password')
  }

  async store({ request, response, session }: HttpContext) {
    let email = ''
    try {
      const payload = await request.validateUsing(requestValidator)
      email = payload.email
    } catch {
      /**
       * Even a malformed address gets the generic message. Replying "that is
       * not a valid email" is harmless, but replying differently for
       * *valid-but-unknown* versus *valid-and-known* is not — and keeping one
       * exit path is the simplest way to never get that distinction wrong.
       */
      session.flash('success', GENERIC_SENT)
      return response.redirect('/login')
    }

    await service.request(email)
    session.flash('success', GENERIC_SENT)
    return response.redirect('/login')
  }

  /**
   * The "choose a new password" form, reached from the emailed link.
   *
   * A dead token renders the same page with `invalid: true` rather than a 404:
   * "this link has expired, request another" is actionable, "page not found"
   * is not.
   */
  async edit(ctx: HttpContext) {
    const { params, response, inertia } = ctx
    const token = String((params as Record<string, unknown>).token ?? '')

    /**
     * The token is in the URL, so without this header it leaks in the `Referer`
     * of every third-party asset the page loads. Nothing else in this app sets
     * a referrer policy, so it is set here rather than assumed.
     */
    response.header('Referrer-Policy', 'no-referrer')
    response.header('Cache-Control', 'no-store')

    const row = await service.verify(token)

    const override = await overrides.resolve('resetPassword')
    if (override) {
      /**
       * The token reaches the block through `bindings` — the same channel a
       * product page uses to tell its blocks which slug the URL named. It is
       * echoed to the client as `BlockBindingsContext`, so `ResetPasswordForm`
       * reads it with `useBinding('token')` and needs no prop plumbing of its
       * own. `invalid` rides along as a string because bindings are strings.
       */
      return renderer.render(override, ctx, {
        skipSnapshot: true,
        bindings: { params: { token, invalid: row ? '' : '1' } },
      })
    }

    return renderPage(inertia, 'auth/reset-password', {
      token,
      invalid: !row,
      // Echoed so the form can offer "request a new link" without a round trip.
      requestPath: '/forgot-password',
    })
  }

  async update({ request, response, session }: HttpContext) {
    let payload: Awaited<ReturnType<typeof resetValidator.validate>>
    try {
      payload = await request.validateUsing(resetValidator)
    } catch {
      session.flash('error', 'Password must be at least 8 characters and both fields must match.')
      return response.redirect().back()
    }

    const ok = await service.consume(payload.token, payload.password)
    if (!ok) {
      session.flash('error', 'That reset link has expired or was already used. Request a new one.')
      return response.redirect('/forgot-password')
    }

    /**
     * Deliberately not auto-logged-in. Making the account sign in once with the
     * new password proves it was actually stored, and keeps "clicked a link in
     * an email" from being a login on its own.
     */
    session.flash('success', 'Password updated. Sign in with your new password.')
    return response.redirect('/login')
  }
}
