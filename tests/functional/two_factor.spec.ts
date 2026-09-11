import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { TOTP, Secret } from 'otpauth'
import User from '#models/user'
import {
  beginEnroll,
  confirmEnroll,
  disableTwoFactor,
  verifyChallenge,
  isTwoFactorEnabled,
} from '#services/two_factor_service'

const PURPOSE = 'admin_totp_secret'

function codeFor(secret: string): string {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()
}

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

test.group('Two-factor service (admin User)', (group) => {
  group.each.setup(async () => resetDatabase())

  test('enrolment is pending until a valid code confirms it', async ({ assert }) => {
    const user = await adminUser()

    const { secret } = await beginEnroll(user, PURPOSE, user.email, 'Driftless')
    assert.isNotNull(user.twoFactorSecretEnc)
    assert.isNull(user.twoFactorEnabledAt)
    assert.isFalse(isTwoFactorEnabled(user))

    // Wrong code does not enable.
    assert.isNull(await confirmEnroll(user, PURPOSE, '000000'))
    assert.isNull(user.twoFactorEnabledAt)

    // Correct code enables and returns 10 recovery codes.
    const codes = await confirmEnroll(user, PURPOSE, codeFor(secret))
    assert.isNotNull(codes)
    assert.lengthOf(codes!, 10)
    assert.isNotNull(user.twoFactorEnabledAt)
    assert.isTrue(isTwoFactorEnabled(user))

    // Secret is not stored in plaintext.
    assert.notInclude(user.twoFactorSecretEnc ?? '', secret)
  })

  test('challenge accepts a live TOTP code', async ({ assert }) => {
    const user = await adminUser()
    const { secret } = await beginEnroll(user, PURPOSE, user.email, 'Driftless')
    await confirmEnroll(user, PURPOSE, codeFor(secret))

    assert.isTrue(await verifyChallenge(user, PURPOSE, codeFor(secret)))
    assert.isFalse(await verifyChallenge(user, PURPOSE, '000000'))
  })

  test('a recovery code works exactly once', async ({ assert }) => {
    const user = await adminUser()
    const { secret } = await beginEnroll(user, PURPOSE, user.email, 'Driftless')
    const codes = await confirmEnroll(user, PURPOSE, codeFor(secret))
    const recovery = codes![0]!

    assert.isTrue(await verifyChallenge(user, PURPOSE, recovery))
    // Second use is rejected.
    assert.isFalse(await verifyChallenge(user, PURPOSE, recovery))
    // A different, unused one still works.
    assert.isTrue(await verifyChallenge(user, PURPOSE, codes![1]!))
  })

  test('disable clears every 2FA column', async ({ assert }) => {
    const user = await adminUser()
    const { secret } = await beginEnroll(user, PURPOSE, user.email, 'Driftless')
    await confirmEnroll(user, PURPOSE, codeFor(secret))

    await disableTwoFactor(user)
    assert.isNull(user.twoFactorSecretEnc)
    assert.isNull(user.twoFactorEnabledAt)
    assert.lengthOf(user.twoFactorRecoveryCodes, 0)

    // A fresh load from the DB confirms it persisted.
    const reloaded = await adminUser()
    assert.isNull(reloaded.twoFactorSecretEnc)
    assert.isNull(reloaded.twoFactorEnabledAt)
    assert.isFalse(await verifyChallenge(reloaded, PURPOSE, codeFor(secret)))
  })

  test('a wrong purpose tag cannot decrypt the secret', async ({ assert }) => {
    const user = await adminUser()
    const { secret } = await beginEnroll(user, PURPOSE, user.email, 'Driftless')
    await confirmEnroll(user, PURPOSE, codeFor(secret))

    // Same ciphertext, different stack's purpose → no match.
    assert.isFalse(await verifyChallenge(user, 'ecommerce_customer_totp_secret', codeFor(secret)))
  })
})
