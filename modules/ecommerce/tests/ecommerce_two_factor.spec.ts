import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { TOTP, Secret } from 'otpauth'
import AccountAuthService from '#modules/ecommerce/services/account_auth_service'
import AccountTwoFactorService from '#modules/ecommerce/services/account_two_factor_service'

const auth = new AccountAuthService()
const twoFactor = new AccountTwoFactorService()

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

async function customerWithPassword() {
  return auth.adminCreate({ email: 'buyer@example.com', password: 'sup3rsecret', firstName: 'Bea' })
}

test.group('E-commerce | Account 2FA', (group) => {
  group.each.setup(async () => resetDatabase())

  test('enrol → confirm enables 2FA and returns recovery codes', async ({ assert }) => {
    const customer = await customerWithPassword()
    assert.isFalse(twoFactor.isEnabled(customer))

    const { secret } = await twoFactor.beginEnroll(customer)
    assert.isNull(customer.twoFactorEnabledAt)

    assert.isNull(await twoFactor.confirmEnroll(customer, '000000'))

    const codes = await twoFactor.confirmEnroll(customer, codeFor(secret))
    assert.isNotNull(codes)
    assert.lengthOf(codes!, 10)
    assert.isTrue(twoFactor.isEnabled(customer))
  })

  test('challenge accepts a TOTP code or a single-use recovery code', async ({ assert }) => {
    const customer = await customerWithPassword()
    const { secret } = await twoFactor.beginEnroll(customer)
    const codes = await twoFactor.confirmEnroll(customer, codeFor(secret))

    assert.isTrue(await twoFactor.verifyChallenge(customer, codeFor(secret)))

    const recovery = codes![0]!
    assert.isTrue(await twoFactor.verifyChallenge(customer, recovery))
    assert.isFalse(await twoFactor.verifyChallenge(customer, recovery))
  })

  test('disable requires the correct password', async ({ assert }) => {
    const customer = await customerWithPassword()
    const { secret } = await twoFactor.beginEnroll(customer)
    await twoFactor.confirmEnroll(customer, codeFor(secret))

    assert.isFalse(await twoFactor.disable(customer, 'wrong-password'))
    assert.isTrue(twoFactor.isEnabled(customer))

    assert.isTrue(await twoFactor.disable(customer, 'sup3rsecret'))
    assert.isFalse(twoFactor.isEnabled(customer))
    assert.isNull(customer.twoFactorSecretEnc)
  })

  test('challenge token round-trips the customer id and rejects garbage', async ({ assert }) => {
    const customer = await customerWithPassword()
    const token = twoFactor.issueChallengeToken(customer)

    assert.equal(twoFactor.resolveChallengeToken(token), customer.id)
    assert.isNull(twoFactor.resolveChallengeToken('not-a-real-token'))
  })

  test('a passwordless (guest) account cannot disable via password', async ({ assert }) => {
    const guest = await auth.adminCreate({ email: 'guest@example.com' })
    assert.isFalse(await twoFactor.disable(guest, 'anything'))
  })
})
