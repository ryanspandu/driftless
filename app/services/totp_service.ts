import crypto from 'node:crypto'
import { TOTP, Secret } from 'otpauth'

/**
 * TOTP (authenticator-app) primitives — storage-agnostic.
 *
 * Shared by both auth stacks: the admin `User` (framework guard) and the
 * storefront `Customer` (custom `CustomerAuthService`). The crypto is identical;
 * only *where* the secret is stored differs, so that stays out of here. Nothing
 * in this file touches the database.
 */

const ISSUER_FALLBACK = 'Driftless'

/** One single-use recovery code, stored by hash; `usedAt` set once redeemed. */
export interface RecoveryCode {
  hash: string
  usedAt: string | null
}

/**
 * Lucid column config for the nullable recovery-codes array.
 *
 * `jsonColumn` defaults an empty value to `{}`; recovery codes want `[]`, and a
 * disabled account should read back as an empty list, not an object.
 */
export const recoveryCodesColumn = {
  prepare: (value: unknown) => (value == null ? null : JSON.stringify(value)),
  consume: (value: unknown): RecoveryCode[] =>
    value == null ? [] : typeof value === 'string' ? JSON.parse(value) : (value as RecoveryCode[]),
}

function totp(secretBase32: string, label: string, issuer: string): TOTP {
  return new TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  })
}

/** A fresh base32 secret for a new enrolment. */
export function generateSecret(): string {
  return new Secret({ size: 20 }).base32
}

/** The `otpauth://totp/...` URI an authenticator app scans to add the account. */
export function otpauthUri(secret: string, accountLabel: string, issuer = ISSUER_FALLBACK): string {
  return totp(secret, accountLabel, issuer).toString()
}

/**
 * True when `code` is a valid 6-digit TOTP for `secret`, within ±`window` steps
 * (default ±1 = ±30s, tolerating clock drift). Non-digit / wrong-length input is
 * rejected before the verifier runs, so junk never reaches it.
 */
export function verifyCode(secret: string, code: string, window = 1): boolean {
  const cleaned = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false
  const delta = totp(secret, 'account', ISSUER_FALLBACK).validate({ token: cleaned, window })
  return delta !== null
}

/**
 * `n` single-use recovery codes, formatted `XXXXX-XXXXX` from an unambiguous
 * alphabet (no I/O/0/1). High entropy, so they need no KDF — the caller stores
 * only {@link hashRecoveryCode} of each.
 */
export function generateRecoveryCodes(n = 10): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const codes: string[] = []
  for (let i = 0; i < n; i++) {
    const raw = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('')
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`)
  }
  return codes
}

/**
 * The at-rest hash of a recovery code. A fast digest is right — the code is high
 * entropy, so there is nothing to brute-force (the same rationale as the session
 * token hashing in `customer_auth_service.ts`). Input is normalised (upper-cased,
 * separators stripped) so `abcde-fghij`, `ABCDEFGHIJ` and `ABCDE FGHIJ` all match.
 */
export function hashRecoveryCode(code: string): string {
  const normalised = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return crypto.createHash('sha256').update(normalised).digest('hex')
}
