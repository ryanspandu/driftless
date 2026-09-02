import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import UserAuthService from '#services/user_auth_service'
import {
  beginEnroll,
  confirmEnroll,
  disableTwoFactor,
  verifyChallenge,
} from '#services/two_factor_service'

/**
 * Admin (dashboard `User`) two-factor: the post-password login challenge plus
 * self-service enrol / confirm / disable. The TOTP secret is encrypted with a
 * purpose tag distinct from the customer stack so ciphertext can't cross over.
 */
const PURPOSE = 'admin_totp_secret'
const ISSUER = 'Driftless'
const MAX_ATTEMPTS = 5

export default class TwoFactorController {
  /** GET /login/2fa — the code page, only reachable mid-login. */
  async challenge({ session, response, inertia }: HttpContext) {
    const pendingId = session.get('pending_2fa_user_id')
    if (!pendingId) return response.redirect('/login')
    return inertia.render('auth/two-factor', {})
  }

  /** POST /login/2fa — verify the code, then open the real session. */
  async verifyChallenge({ request, session, auth, response }: HttpContext) {
    const pendingId = session.get('pending_2fa_user_id')
    if (!pendingId) return response.redirect('/login')

    const user = await User.find(pendingId)
    if (!user || !user.twoFactorEnabledAt || user.status === 'INACTIVE') {
      session.forget('pending_2fa_user_id')
      session.forget('pending_2fa_attempts')
      session.flash('error', 'Invalid credentials')
      return response.redirect('/login')
    }

    const code = String(request.input('code') ?? '')
    const ok = await verifyChallenge(user, PURPOSE, code)
    if (!ok) {
      const attempts = Number(session.get('pending_2fa_attempts') ?? 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        session.forget('pending_2fa_user_id')
        session.forget('pending_2fa_attempts')
        session.flash('error', 'Too many attempts. Please sign in again.')
        return response.redirect('/login')
      }
      session.put('pending_2fa_attempts', attempts)
      session.flash('error', 'Invalid authentication code')
      return response.redirect().back()
    }

    session.forget('pending_2fa_user_id')
    session.forget('pending_2fa_attempts')
    await auth.use('web').login(user)
    return response.redirect('/admin/dashboard')
  }

  /** POST /api/me/2fa/enroll — mint a pending secret + QR for the signed-in admin. */
  async enroll({ auth, response }: HttpContext) {
    const user = auth.user! as User
    if (user.twoFactorEnabledAt) {
      return response.status(409).json({ message: 'Two-factor is already enabled' })
    }
    const { otpauthUri, secret } = await beginEnroll(user, PURPOSE, user.email, ISSUER)
    return response.json({ otpauthUri, secret })
  }

  /** POST /api/me/2fa/confirm — first valid code turns it on; returns recovery codes once. */
  async confirm({ auth, request, response }: HttpContext) {
    const user = auth.user! as User
    if (user.twoFactorEnabledAt) {
      return response.status(409).json({ message: 'Two-factor is already enabled' })
    }
    const code = String(request.input('code') ?? '')
    const recoveryCodes = await confirmEnroll(user, PURPOSE, code)
    if (!recoveryCodes) {
      return response.status(422).json({ message: 'Invalid authentication code' })
    }
    return response.json({ recoveryCodes })
  }

  /** POST /api/me/2fa/disable — requires the account password. */
  async disable({ auth, request, response }: HttpContext) {
    const user = auth.user! as User
    if (!user.twoFactorEnabledAt) {
      return response.status(409).json({ message: 'Two-factor is not enabled' })
    }
    const password = String(request.input('password') ?? '')
    const valid = await UserAuthService.verifyPassword(user, password)
    if (!valid) {
      return response.status(422).json({ message: 'Incorrect password' })
    }
    await disableTwoFactor(user)
    return response.json({ success: true })
  }
}
