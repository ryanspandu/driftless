import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import Account from '#modules/ecommerce/models/account'
import AccountSession from '#modules/ecommerce/models/account_session'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'

/**
 * Storefront authentication.
 *
 * Deliberately **not** an Adonis auth guard. A second guard on the same
 * `ctx.auth` would mean one `auth.use('...')` typo away from a customer being
 * treated as staff. Separate cookie, separate table, separate code path — so
 * the isolation is structural rather than a convention someone has to remember.
 *
 * `ctx.auth.user` therefore never holds a customer, and nothing here ever
 * touches `users`.
 */

/** The cookie carrying the storefront session token. */
export const ACCOUNT_SESSION_COOKIE = 'dl_shop'

const SESSION_DAYS = 30

/** Hash a token for storage. Fast digest is right here: the token is 256 bits
 *  of entropy, so there is nothing to brute-force. */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Keyed so the stored value is not reversible from a rainbow table. */
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254)
}

export interface AccountDto {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string
  phone: string | null
  acceptsMarketing: boolean
  ordersCount: number
  /** Whether the account can sign in (has a password) vs. a guest record. */
  hasPassword: boolean
  /** Whether authenticator-app 2FA is active on the account. */
  twoFactorEnabled: boolean
  memberSince: string | null
  /** Lifetime spend, only when a currency/locale is supplied (the account page). */
  totalSpent: MoneyDto | null
}

export function toAccountDto(
  customer: Account,
  opts?: { currency: string; locale: string }
): AccountDto {
  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    fullName: customer.fullName,
    phone: customer.phone,
    acceptsMarketing: customer.acceptsMarketing,
    ordersCount: customer.ordersCount,
    hasPassword: Boolean(customer.passwordHash),
    twoFactorEnabled: customer.twoFactorEnabledAt != null,
    memberSince: customer.createdAt?.toISO() ?? null,
    totalSpent: opts ? Money.toDto(customer.totalSpentAmount, opts.currency, opts.locale) : null,
  }
}

export default class AccountAuthService {
  /**
   * Find or create the customer behind an email, without a password.
   *
   * Used at guest checkout so an order can be attached to a person without
   * forcing them to make an account. A row created this way has
   * `passwordHash: null` and cannot be signed into until someone sets one.
   */
  async findOrCreateGuest(
    email: string,
    details: { firstName?: string | null; lastName?: string | null } = {}
  ): Promise<Account> {
    const normalised = normaliseEmail(email)

    const existing = await Account.query()
      .where('email', normalised)
      .whereNull('deleted_at')
      .first()
    if (existing) return existing

    return Account.create({
      id: newUlid(),
      email: normalised,
      passwordHash: null,
      firstName: details.firstName ?? null,
      lastName: details.lastName ?? null,
      status: 'active',
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })
  }

  /**
   * Register an account.
   *
   * **Enumeration-resistant**: the caller cannot tell an already-registered
   * address from a new one. When the email exists with no password (a previous
   * guest checkout) the password is set; when it exists *with* one, this
   * returns without signing anyone in — identical from the outside to success.
   */
  async register(input: {
    email: string
    password: string
    firstName?: string | null
    lastName?: string | null
    acceptsMarketing?: boolean
  }): Promise<{ account: Account | null }> {
    const email = normaliseEmail(input.email)

    if (input.password.length < 8) {
      throw publicError.unprocessable(
        'Password must be at least 8 characters.',
        'password_too_short'
      )
    }

    const existing = await Account.query().where('email', email).whereNull('deleted_at').first()

    if (existing) {
      if (existing.passwordHash) {
        /**
         * Already has an account. Do the same work anyway — a hash costs the
         * same either way — so response timing does not distinguish the cases,
         * and return no session. The UI says "check your email either way".
         */
        await hash.make(input.password)
        return { account: null }
      }

      // Guest row being upgraded to a real account.
      existing.passwordHash = await hash.make(input.password)
      if (input.firstName !== undefined) existing.firstName = input.firstName ?? null
      if (input.lastName !== undefined) existing.lastName = input.lastName ?? null
      if (input.acceptsMarketing !== undefined) existing.acceptsMarketing = input.acceptsMarketing
      await existing.save()
      return { account: existing }
    }

    const customer = await Account.create({
      id: newUlid(),
      email,
      passwordHash: await hash.make(input.password),
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      status: 'active',
      acceptsMarketing: input.acceptsMarketing ?? false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })

    return { account: customer }
  }

  /**
   * Create a customer from the admin.
   *
   * Unlike {@link register}, this is **not** enumeration-resistant: the admin is
   * trusted, so a duplicate email is a plain error rather than a silent no-op.
   * The password is optional — leaving it blank makes a record the admin can
   * attach orders to (like a guest), and setting one lets the customer sign in.
   */
  async adminCreate(input: {
    email: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    password?: string | null
    acceptsMarketing?: boolean
    status?: 'active' | 'blocked'
  }): Promise<Account> {
    const email = normaliseEmail(input.email)

    const existing = await Account.query().where('email', email).whereNull('deleted_at').first()
    if (existing) {
      throw publicError.unprocessable('A customer with that email already exists.', 'email_taken')
    }

    const password = (input.password ?? '').trim()
    if (password && password.length < 8) {
      throw publicError.unprocessable(
        'Password must be at least 8 characters.',
        'password_too_short'
      )
    }

    return Account.create({
      id: newUlid(),
      email,
      passwordHash: password ? await hash.make(password) : null,
      firstName: input.firstName?.trim() || null,
      lastName: input.lastName?.trim() || null,
      phone: input.phone?.trim() || null,
      status: input.status ?? 'active',
      acceptsMarketing: input.acceptsMarketing ?? false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })
  }

  /** A signed-in customer edits their own profile. Email is intentionally not
   *  editable here — it is the account key and changing it is a separate flow. */
  async updateProfile(
    customer: Account,
    input: {
      firstName?: string | null
      lastName?: string | null
      phone?: string | null
      acceptsMarketing?: boolean
    }
  ): Promise<Account> {
    if (input.firstName !== undefined) customer.firstName = input.firstName?.trim() || null
    if (input.lastName !== undefined) customer.lastName = input.lastName?.trim() || null
    if (input.phone !== undefined) customer.phone = input.phone?.trim() || null
    if (input.acceptsMarketing !== undefined) customer.acceptsMarketing = input.acceptsMarketing
    await customer.save()
    return customer
  }

  /**
   * Change a signed-in customer's password.
   *
   * The current password is required (a guest row has none and cannot use this),
   * and **every** session is revoked so a stolen one dies the moment the password
   * changes. The caller re-issues a session for the device that made the change.
   */
  async changePassword(
    customer: Account,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!customer.passwordHash) {
      throw publicError.unprocessable(
        'Set a password on your account before changing it.',
        'no_password'
      )
    }
    const ok = await hash.verify(customer.passwordHash, currentPassword)
    if (!ok) {
      throw publicError.unprocessable('Your current password is incorrect.', 'wrong_password')
    }
    if (newPassword.length < 8) {
      throw publicError.unprocessable(
        'Password must be at least 8 characters.',
        'password_too_short'
      )
    }
    customer.passwordHash = await hash.make(newPassword)
    await customer.save()
    await this.revokeAllSessions(customer.id)
  }

  /**
   * Verify credentials.
   *
   * Returns null for every failure — wrong password, unknown address, blocked
   * account — and always performs a hash comparison so an unknown address
   * cannot be distinguished by how quickly the request comes back.
   */
  async verify(email: string, password: string): Promise<Account | null> {
    const customer = await Account.query()
      .where('email', normaliseEmail(email))
      .whereNull('deleted_at')
      .first()

    /**
     * A dummy verify against a real hash when there is no account, so both
     * paths do the same scrypt work. Skipping it is the classic timing oracle.
     */
    if (!customer?.passwordHash) {
      await hash.verify(await hash.make('timing-equaliser'), password).catch(() => false)
      return null
    }

    const ok = await hash.verify(customer.passwordHash, password)
    if (!ok || !customer.isActive) return null

    return customer
  }

  /** Mint a session and set the cookie. */
  async startSession(ctx: HttpContext, customer: Account): Promise<AccountSession> {
    const token = crypto.randomBytes(32).toString('base64url')

    const session = await AccountSession.create({
      id: newUlid(),
      accountId: customer.id,
      tokenHash: hashToken(token),
      expiresAt: DateTime.now().plus({ days: SESSION_DAYS }),
      ipHash: hashIp(ctx.request.ip()),
      userAgent: ctx.request.header('user-agent')?.slice(0, 512) ?? null,
      createdAt: DateTime.now(),
    })

    ctx.response.cookie(ACCOUNT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: app.inProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    })

    return session
  }

  /**
   * Resolve the customer for a request, or null.
   *
   * Re-checks `isActive` on every request rather than trusting the session:
   * blocking a customer must take effect immediately, not at their next login.
   */
  async resolve(ctx: HttpContext): Promise<Account | null> {
    const token = ctx.request.cookie(ACCOUNT_SESSION_COOKIE) as string | undefined
    if (!token || typeof token !== 'string') return null

    const session = await AccountSession.query()
      .where('token_hash', hashToken(token))
      .whereNull('revoked_at')
      .where('expires_at', '>', DateTime.now().toSQL()!)
      .first()

    if (!session) return null

    const customer = await Account.query()
      .where('id', session.accountId)
      .whereNull('deleted_at')
      .first()

    if (!customer?.isActive) return null

    // Cheap enough to be worth having: shows in the admin when a session was
    // last seen, and helps spot stale ones.
    session.lastUsedAt = DateTime.now()
    await session.save()

    return customer
  }

  /** End the current session and clear the cookie. */
  async endSession(ctx: HttpContext): Promise<void> {
    const token = ctx.request.cookie(ACCOUNT_SESSION_COOKIE) as string | undefined

    if (typeof token === 'string' && token) {
      await AccountSession.query()
        .where('token_hash', hashToken(token))
        .whereNull('revoked_at')
        .update({ revoked_at: DateTime.now().toSQL() })
    }

    ctx.response.clearCookie(ACCOUNT_SESSION_COOKIE, { path: '/' })
  }

  /**
   * Revoke every session a customer holds.
   *
   * Called on password change: a password reset that leaves the attacker's
   * existing session alive has not actually locked them out.
   */
  async revokeAllSessions(accountId: string): Promise<void> {
    await AccountSession.query()
      .where('account_id', accountId)
      .whereNull('revoked_at')
      .update({ revoked_at: DateTime.now().toSQL() })
  }
}
