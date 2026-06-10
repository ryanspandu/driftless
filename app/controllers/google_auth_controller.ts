import User from '#models/user'
import Role from '#models/role'
import hash from '@adonisjs/core/services/hash'
import { randomBytes } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { IntegrationSettingsService } from '#services/settings_service'

const integrationService = new IntegrationSettingsService()

interface GoogleProfile {
  googleSub: string
  email: string
  firstName: string
  lastName: string | null
  emailVerified: boolean
}

export default class GoogleAuthController {
  async status({ response }: HttpContext) {
    const cfg = await integrationService.getAuthPublicConfig()
    return response.json({ configured: cfg.google.configured })
  }

  async start({ response, session }: HttpContext) {
    const cfg = await integrationService.resolveGoogleOAuth()
    if (!cfg) {
      return response.status(503).json({ message: 'Google sign-in is not configured' })
    }

    const state = randomBytes(16).toString('hex')
    session.put('google_oauth_state', state)

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    })

    return response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  }

  async callback({ request, response, session, auth }: HttpContext) {
    const redirectLogin = (msg: string) =>
      response.redirect(`/login?error=${encodeURIComponent(msg)}`)

    const oauthError = request.input('error')
    if (oauthError) return redirectLogin(oauthError)

    const code = request.input('code')
    const state = request.input('state')
    const savedState = session.get('google_oauth_state')
    session.forget('google_oauth_state')

    if (!code || !state || state !== savedState) {
      return redirectLogin('invalid_oauth_state')
    }

    const cfg = await integrationService.resolveGoogleOAuth()
    if (!cfg) return redirectLogin('oauth_not_configured')

    let profile: GoogleProfile
    try {
      profile = await this.exchangeCode(cfg, code)
    } catch (e) {
      return redirectLogin(e instanceof Error ? e.message : 'oauth_failed')
    }

    try {
      const user = await this.findOrCreateUser(profile)
      if (user.status !== 'ACTIVE') return redirectLogin('account_inactive')
      await auth.use('web').login(user)
      return response.redirect('/admin/dashboard')
    } catch (e) {
      return redirectLogin(e instanceof Error ? e.message : 'login_failed')
    }
  }

  private async exchangeCode(
    cfg: { clientId: string; clientSecret: string; redirectUri: string },
    code: string
  ): Promise<GoogleProfile> {
    const body = new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    })

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })

    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string }
    if (!tokens.access_token) throw new Error('oauth_token_exchange_failed')

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const raw = (await userRes.json()) as {
      sub?: string
      email?: string
      email_verified?: boolean
      given_name?: string
      family_name?: string
      name?: string
    }

    if (!raw.sub || !raw.email) throw new Error('google_userinfo_failed')

    return {
      googleSub: raw.sub,
      email: raw.email.toLowerCase(),
      firstName: raw.given_name?.trim() || raw.name?.split(/\s+/)[0]?.trim() || 'User',
      lastName: raw.family_name?.trim() ?? null,
      emailVerified: raw.email_verified === true,
    }
  }

  private async findOrCreateUser(profile: GoogleProfile): Promise<User> {
    const byGoogle = await User.query()
      .where('google_sub', profile.googleSub)
      .whereNull('deleted_at')
      .first()
    if (byGoogle) return byGoogle

    const byEmail = await User.query()
      .where('email', profile.email)
      .whereNull('deleted_at')
      .first()

    if (byEmail) {
      byEmail.googleSub = profile.googleSub
      if (profile.emailVerified) byEmail.emailVerifiedAt = new Date() as any
      await byEmail.save()
      return byEmail
    }

    const baseUsername = profile.email.split('@')[0]!.replace(/[^a-z0-9_]/gi, '_').slice(0, 32)
    let username = baseUsername
    let n = 0
    while (await User.query().where('username', username).whereNull('deleted_at').first()) {
      n++
      username = `${baseUsername}${n}`.slice(0, 32)
    }

    const user = await User.create({
      email: profile.email,
      username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: `${profile.firstName} ${profile.lastName ?? ''}`.trim(),
      password: await hash.make(randomBytes(32).toString('hex')),
      googleSub: profile.googleSub,
      status: 'ACTIVE',
      emailVerifiedAt: profile.emailVerified ? (new Date() as any) : null,
    })

    const userRole = await Role.query().where('name', 'USER').whereNull('deleted_at').first()
    if (userRole) await user.related('roles').attach([userRole.id])

    return user
  }
}
