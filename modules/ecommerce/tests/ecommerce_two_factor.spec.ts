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

  test('challenge token resolves the customer and rejects garbage', async ({ assert }) => {
    const customer = await customerWithPassword()
    const token = await twoFactor.issueChallengeToken(customer)

    const resolved = await twoFactor.consumeChallengeToken(token)
    assert.equal(resolved?.id, customer.id)
    assert.isNull(await twoFactor.consumeChallengeToken('not-a-real-token'))
  })

  test('challenge token is single-use — a spent or superseded token is rejected', async ({
    assert,
  }) => {
    const customer = await customerWithPassword()

    // Spending it (clearing the nonce, as a successful verify does) kills it.
    const first = await twoFactor.issueChallengeToken(customer)
    const spent = await twoFactor.consumeChallengeToken(first)
    assert.isNotNull(spent)
    await twoFactor.clearChallenge(spent!)
    assert.isNull(await twoFactor.consumeChallengeToken(first))

    // Issuing a fresh token supersedes any earlier one (nonce rotates).
    const older = await twoFactor.issueChallengeToken(customer)
    await twoFactor.issueChallengeToken(customer)
    assert.isNull(await twoFactor.consumeChallengeToken(older))
  })

  test('a passwordless (guest) account cannot disable via password', async ({ assert }) => {
    const guest = await auth.adminCreate({ email: 'guest@example.com' })
    assert.isFalse(await twoFactor.disable(guest, 'anything'))
  })
})
