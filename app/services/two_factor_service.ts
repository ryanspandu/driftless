import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import {
  generateSecret,
  otpauthUri,
  verifyCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  type RecoveryCode,
} from '#services/totp_service'

/**
 * Record-level 2FA orchestration, shared by both auth stacks.
 *
 * Anything with the three 2FA columns and `save()` — the admin `User` or the
 * storefront `Customer` — satisfies `TwoFactorRecord`, so the enrol / confirm /
 * disable / challenge logic lives once. Only *password re-verification on
 * disable* is left to the caller, because the two identities hash passwords
 * differently. The secret is always encrypted with a caller-supplied `purpose`
 * tag so ciphertext can't be moved between the two tables.
 */
export interface TwoFactorRecord {
  twoFactorSecretEnc: string | null
  twoFactorEnabledAt: DateTime | null
  twoFactorRecoveryCodes: RecoveryCode[]
  save(): Promise<unknown>
}

export function isTwoFactorEnabled(record: TwoFactorRecord): boolean {
  return record.twoFactorEnabledAt != null
}

/**
 * Begin enrolment: mint a secret, store it encrypted but **pending** (not yet
 * enabled), and return the `otpauth://` URI for the QR. Any half-finished prior
 * enrolment is overwritten.
 */
export async function beginEnroll(
  record: TwoFactorRecord,
  purpose: string,
  accountLabel: string,
  issuer: string
): Promise<{ otpauthUri: string; secret: string }> {
  const secret = generateSecret()
  record.twoFactorSecretEnc = encryption.encrypt(secret, undefined, purpose)
  record.twoFactorEnabledAt = null
  record.twoFactorRecoveryCodes = []
  await record.save()
  return { otpauthUri: otpauthUri(secret, accountLabel, issuer), secret }
}

/**
 * Confirm enrolment with a first code. On success: mark enabled, mint and store
 * recovery-code hashes, and return the plaintext codes **once** (the only time
 * they exist outside a hash). Returns null when the code is wrong or no pending
 * secret is set.
 */
export async function confirmEnroll(
  record: TwoFactorRecord,
  purpose: string,
  code: string
): Promise<string[] | null> {
  const secret = record.twoFactorSecretEnc
    ? encryption.decrypt<string>(record.twoFactorSecretEnc, purpose)
    : null
  if (!secret || !verifyCode(secret, code)) return null

  const codes = generateRecoveryCodes()
  record.twoFactorRecoveryCodes = codes.map((c) => ({ hash: hashRecoveryCode(c), usedAt: null }))
  record.twoFactorEnabledAt = DateTime.now()
  await record.save()
  return codes
}

/** Turn 2FA off — clears the secret, the enabled flag and every recovery code. */
export async function disableTwoFactor(record: TwoFactorRecord): Promise<void> {
  record.twoFactorSecretEnc = null
  record.twoFactorEnabledAt = null
  record.twoFactorRecoveryCodes = []
  await record.save()
}

/**
 * Verify a login challenge: a live TOTP code, or a single-use recovery code
 * (which is then burned). Returns false unless 2FA is actually enabled.
 */
export async function verifyChallenge(
  record: TwoFactorRecord,
  purpose: string,
  code: string
): Promise<boolean> {
  if (!record.twoFactorEnabledAt || !record.twoFactorSecretEnc) return false

  const secret = encryption.decrypt<string>(record.twoFactorSecretEnc, purpose)
  if (secret && verifyCode(secret, code)) return true

  // Recovery-code fallback — single use, so a match is burned before we return.
  const hash = hashRecoveryCode(code)
  const codes = record.twoFactorRecoveryCodes ?? []
  const match = codes.find((c) => c.hash === hash && !c.usedAt)
  if (!match) return false
  match.usedAt = DateTime.now().toISO()
  record.twoFactorRecoveryCodes = [...codes]
  await record.save()
  return true
}
