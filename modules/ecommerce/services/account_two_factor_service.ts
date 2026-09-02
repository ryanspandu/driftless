import hash from '@adonisjs/core/services/hash'
import encryption from '@adonisjs/core/services/encryption'
import type Account from '#modules/ecommerce/models/account'
import {
  beginEnroll,
  confirmEnroll,
  disableTwoFactor,
  verifyChallenge,
  isTwoFactorEnabled,
} from '#services/two_factor_service'

/**
 * Storefront-customer 2FA — the customer-side companion to the admin
 * `TwoFactorController`, reusing the shared record-level orchestration. The
 * secret is encrypted under a purpose tag distinct from the admin one, so a
 * `users` secret can never be decrypted as a `Account` one or vice-versa.
 *
 * The login-challenge handoff (no pre-auth session exists for the storefront)
 * uses a short-lived encrypted pending token instead of a server session.
 */
const SECRET_PURPOSE = 'ecommerce_customer_totp_secret'
const CHALLENGE_PURPOSE = 'ecommerce_2fa_challenge'
const ISSUER = 'Driftless'

export default class AccountTwoFactorService {
  isEnabled(customer: Account): boolean {
    return isTwoFactorEnabled(customer)
  }

  /** Mint a pending secret + QR URI for a signed-in customer. */
  async beginEnroll(customer: Account): Promise<{ otpauthUri: string; secret: string }> {
    return beginEnroll(customer, SECRET_PURPOSE, customer.email, ISSUER)
  }

  /** First valid code enables 2FA and returns the one-time recovery codes. */
  async confirmEnroll(customer: Account, code: string): Promise<string[] | null> {
    return confirmEnroll(customer, SECRET_PURPOSE, code)
  }

  /** Turn 2FA off — requires the account password (a live session alone can't). */
  async disable(customer: Account, password: string): Promise<boolean> {
    if (!customer.passwordHash) return false
    const ok = await hash.verify(customer.passwordHash, password)
    if (!ok) return false
    await disableTwoFactor(customer)
    return true
  }

  /** Verify a login-challenge code (TOTP or a single-use recovery code). */
  async verifyChallenge(customer: Account, code: string): Promise<boolean> {
    return verifyChallenge(customer, SECRET_PURPOSE, code)
  }

  /**
   * A short-lived, tamper-proof token that stands in for "password verified,
   * awaiting a code". Encrypted (APP_KEY) and self-expiring, so no server-side
   * challenge state is needed and it can't be forged.
   */
  issueChallengeToken(customer: Account): string {
    return encryption.encrypt(customer.id, '10 mins', CHALLENGE_PURPOSE)
  }

  /** The customer id inside a challenge token, or null if invalid/expired. */
  resolveChallengeToken(token: string): string | null {
    return encryption.decrypt<string>(token, CHALLENGE_PURPOSE)
  }
}
