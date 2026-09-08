import { randomUUID } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import encryption from '@adonisjs/core/services/encryption'
import Account from '#modules/ecommerce/models/account'
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
   * A short-lived, tamper-proof token standing in for "password verified,
   * awaiting a code". Encrypted (APP_KEY) and self-expiring, so it can't be
   * forged. Made **single-use** by binding a fresh nonce that is stored on the
   * account: {@link consumeChallengeToken} only accepts a token whose nonce
   * still matches, and {@link clearChallenge} burns it once the code verifies.
   * A captured token therefore cannot be replayed after the login completes,
   * and issuing a new one supersedes any earlier pending token.
   */
  async issueChallengeToken(customer: Account): Promise<string> {
    const nonce = randomUUID()
    customer.twoFactorChallengeNonce = nonce
    await customer.save()
    return encryption.encrypt({ id: customer.id, nonce }, '10 mins', CHALLENGE_PURPOSE)
  }

  /**
   * The account a challenge token names, or null if the token is invalid,
   * expired, or its nonce no longer matches the account's (a spent or
   * superseded token). Returns the loaded account so the caller need not
   * re-read it. Does not burn the nonce — a wrong code should be retryable;
   * {@link clearChallenge} burns it on success.
   */
  async consumeChallengeToken(token: string): Promise<Account | null> {
    const payload = encryption.decrypt<{ id: string; nonce: string }>(token, CHALLENGE_PURPOSE)
    if (!payload || typeof payload.id !== 'string' || typeof payload.nonce !== 'string') {
      return null
    }
    const account = await Account.query().where('id', payload.id).whereNull('deleted_at').first()
    if (!account || !account.twoFactorChallengeNonce) return null
    if (account.twoFactorChallengeNonce !== payload.nonce) return null
    return account
  }

  /** Burn the challenge nonce so the token that carried it cannot be replayed. */
  async clearChallenge(customer: Account): Promise<void> {
    customer.twoFactorChallengeNonce = null
    await customer.save()
  }
}
