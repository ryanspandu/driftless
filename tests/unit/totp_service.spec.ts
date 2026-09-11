import { test } from '@japa/runner'
import { TOTP, Secret } from 'otpauth'
import {
  generateSecret,
  otpauthUri,
  verifyCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '#services/totp_service'

/** Compute a valid code for a secret at a given time, the way an authenticator would. */
function codeFor(secret: string, timestamp?: number): string {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  return totp.generate(timestamp ? { timestamp } : undefined)
}

test.group('TotpService', () => {
  test('accepts a fresh code and rejects a far-out-of-window one', ({ assert }) => {
    const secret = generateSecret()
    assert.isTrue(verifyCode(secret, codeFor(secret)))

    // Four periods in the past is well outside the ±1-step window.
    const stale = codeFor(secret, Date.now() - 4 * 30 * 1000)
    assert.isFalse(verifyCode(secret, stale))
  })

  test('rejects malformed codes without throwing', ({ assert }) => {
    const secret = generateSecret()
    assert.isFalse(verifyCode(secret, ''))
    assert.isFalse(verifyCode(secret, '12345'))
    assert.isFalse(verifyCode(secret, 'abcdef'))
    assert.isFalse(verifyCode(secret, '1234567'))
  })

  test('tolerates spaces in the entered code', ({ assert }) => {
    const secret = generateSecret()
    const code = codeFor(secret)
    assert.isTrue(verifyCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`))
  })

  test('otpauth uri carries issuer and account label', ({ assert }) => {
    const uri = otpauthUri(generateSecret(), 'user@example.com', 'Driftless')
    assert.match(uri, /^otpauth:\/\/totp\//)
    assert.include(uri, 'issuer=Driftless')
    assert.include(uri, 'user%40example.com')
  })

  test('generates the requested number of well-formed recovery codes', ({ assert }) => {
    const codes = generateRecoveryCodes()
    assert.lengthOf(codes, 10)
    for (const code of codes) {
      assert.match(code, /^[A-Z0-9]{5}-[A-Z0-9]{5}$/)
      // No ambiguous characters.
      assert.notMatch(code, /[IO01]/)
    }
    // Distinct.
    assert.lengthOf(new Set(codes), 10)
  })

  test('recovery-code hash is stable across formatting differences', ({ assert }) => {
    const base = hashRecoveryCode('ABCDE-FGHJK')
    assert.equal(hashRecoveryCode('abcde-fghjk'), base)
    assert.equal(hashRecoveryCode('ABCDE FGHJK'), base)
    assert.equal(hashRecoveryCode('  ABCDEFGHJK  '), base)
    assert.notEqual(hashRecoveryCode('ABCDE-FGHJM'), base)
  })
})
