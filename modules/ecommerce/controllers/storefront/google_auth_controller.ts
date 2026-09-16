import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import { IntegrationSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'
import Account from '#modules/ecommerce/models/account'
import AccountAuthService from '#modules/ecommerce/services/account_auth_service'
import AccountTwoFactorService from '#modules/ecommerce/services/account_two_factor_service'

const integrationService = new IntegrationSettingsService()
const accounts = new AccountAuthService()
const twoFactor = new AccountTwoFactorService()

interface GoogleProfile {
  googleSub: string
  email: string
  firstName: string | null
  lastName: string | null
  emailVerified: boolean
}

/**
 * Google sign-in for storefront shoppers.
 *
 * Mirrors `app/controllers/google_auth_controller.ts` (the admin flow) closely,
 * but resolves/creates rows in `Account` (`ecommerce_accounts`) instead of
 * `User`, and starts a session via `AccountAuthService.startSession` — the
 * storefront's own hand-rolled cookie session, never `ctx.auth`. See that
 * service's file comment for why the two auth systems are kept structurally
 * separate.
 */
export default class ShopGoogleAuthController {
  async start({ response, session }: HttpContext) {
    const cfg = await integrationService.resolveGoogleOAuth({ forShop: true })
    if (!cfg) {
      return response.status(503).json({ message: 'Google sign-in is not configured' })
    }

    const state = randomBytes(16).toString('hex')
    session.put('shop_google_oauth_state', state)

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

  async callback(ctx: HttpContext) {
    const { request, response, session } = ctx
    const redirectLogin = (msg: string) =>
      response.redirect(`/shop/account/login?error=${encodeURIComponent(msg)}`)

    const oauthError = request.input('error')
    if (oauthError) return redirectLogin(oauthError)

    const code = request.input('code')
    const state = request.input('state')
    const savedState = session.get('shop_google_oauth_state')
    session.forget('shop_google_oauth_state')

    if (!code || !state || state !== savedState) {
      return redirectLogin('invalid_oauth_state')
    }

    const cfg = await integrationService.resolveGoogleOAuth({ forShop: true })
    if (!cfg) return redirectLogin('oauth_not_configured')

    let profile: GoogleProfile
    try {
      profile = await this.exchangeCode(cfg, code)
    } catch (e) {
      return redirectLogin(e instanceof Error ? e.message : 'oauth_failed')
    }

    try {
      // Only an already-bound subject can bypass this: email is the account
      // linking key, so an unverified Google claim must never create or bind it.
      const account = await this.findOrCreateAccount(profile)
      if (!account.isActive) return redirectLogin('account_inactive')

      // 2FA is not bypassable via Google: hand back the same pending-token
      // challenge the password login path already uses, and let the existing
      // `/shop/account/login` screen (and its `TwoFactorStep`) take it from
      // the URL — this needs no new page or session-based flow of its own.
      if (twoFactor.isEnabled(account)) {
        const pendingToken = await twoFactor.issueChallengeToken(account)
        return response.redirect(
          `/shop/account/login?needs2fa=1&pendingToken=${encodeURIComponent(pendingToken)}`
        )
      }

      await accounts.startSession(ctx, account)
      return response.redirect('/shop/account')
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
      firstName: raw.given_name?.trim() || raw.name?.split(/\s+/)[0]?.trim() || null,
      lastName: raw.family_name?.trim() ?? null,
      emailVerified: raw.email_verified === true,
    }
  }

  private async findOrCreateAccount(profile: GoogleProfile): Promise<Account> {
    const byGoogle = await Account.query()
      .where('google_sub', profile.googleSub)
      .whereNull('deleted_at')
      .first()
    if (byGoogle) return byGoogle

    if (!profile.emailVerified) throw new Error('google_email_not_verified')

    const byEmail = await Account.query()
      .where('email', profile.email)
      .whereNull('deleted_at')
      .first()

    if (byEmail) {
      byEmail.googleSub = profile.googleSub
      byEmail.emailVerifiedAt = DateTime.now()
      await byEmail.save()
      return byEmail
    }

    // No username/password fields to fill here, unlike the admin `User` — a
    // guest checkout row already has `passwordHash: null` as a normal, valid
    // state, so a Google-only account simply stays that way (sign-in is by
    // Google from then on; `hasPassword` correctly reports false).
    return Account.create({
      id: newUlid(),
      email: profile.email,
      passwordHash: null,
      firstName: profile.firstName,
      lastName: profile.lastName,
      status: 'active',
      googleSub: profile.googleSub,
      emailVerifiedAt: DateTime.now(),
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })
  }
}
