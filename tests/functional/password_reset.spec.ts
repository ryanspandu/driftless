import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import PasswordResetToken from '#models/password_reset_token'
import PasswordResetService from '#services/password_reset_service'
import UserAuthService from '#services/user_auth_service'

const service = new PasswordResetService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/**
 * Mint a real token for a user by driving the service, and return the plaintext.
 *
 * Read back out of the emailed URL rather than reaching into the table, because
 * the URL is the only place the plaintext ever exists — a test that gets it any
 * other way would still pass if the link were built wrong.
 */
async function mintFor(email: string): Promise<string> {
  const context = await service.buildReset(email)
  if (!context) throw new Error(`no reset context for ${email}`)
  return decodeURIComponent(context.resetUrl.split('/reset-password/')[1]!)
}

test.group('Password reset', (group) => {
  group.each.setup(async () => resetDatabase())

  test('an unknown address is indistinguishable from a known one', async ({ client, assert }) => {
    const known = await client.post('/forgot-password').json({ email: 'admin@driftless.local' })
    const unknown = await client.post('/forgot-password').json({ email: 'nobody@example.com' })

    /**
     * The whole point of the flow: same status, same destination, same flash.
     * Any difference here turns the form into a "does this person have an
     * account" oracle.
     */
    assert.equal(known.status(), unknown.status())
    assert.equal(known.header('location'), unknown.header('location'))

    // ...and only the real address produced a token.
    const tokens = await PasswordResetToken.all()
    assert.lengthOf(tokens, 1)
  })

  test('the plaintext token is never stored', async ({ assert }) => {
    const plain = await mintFor('admin@driftless.local')
    const row = await PasswordResetToken.firstOrFail()

    assert.notEqual(row.tokenHash, plain)
    assert.lengthOf(row.tokenHash, 64)
    // Nothing anywhere on the row echoes the secret back.
    assert.notInclude(JSON.stringify(row.serialize()), plain)
  })

  test('a token works once', async ({ assert }) => {
    const plain = await mintFor('admin@driftless.local')

    assert.isTrue(await service.consume(plain, 'BrandNewPassword1'))
    assert.isFalse(await service.consume(plain, 'AnotherPassword2'))

    // The first reset actually took.
    const user = await UserAuthService.verifyCredentialsForLogin(
      'admin@driftless.local',
      'BrandNewPassword1'
    )
    assert.equal(user.email, 'admin@driftless.local')
  })

  test('an expired token is refused', async ({ assert }) => {
    const plain = await mintFor('admin@driftless.local')

    const row = await PasswordResetToken.firstOrFail()
    row.expiresAt = DateTime.now().minus({ minutes: 1 })
    await row.save()

    assert.isNull(await service.verify(plain))
    assert.isFalse(await service.consume(plain, 'ShouldNotApply1'))
  })

  test('requesting a new link kills the outstanding one', async ({ assert }) => {
    const first = await mintFor('admin@driftless.local')
    const second = await mintFor('admin@driftless.local')

    assert.isNull(await service.verify(first))
    assert.isNotNull(await service.verify(second))
  })

  test('spending a token revokes every other one for that account', async ({ assert }) => {
    const admin = await adminUser()
    const plain = await mintFor('admin@driftless.local')

    // A second live token, as if an earlier request had been sitting unused.
    await PasswordResetToken.create({
      id: 'stale-token-row',
      userId: admin.id,
      tokenHash: 'f'.repeat(64),
      expiresAt: DateTime.now().plus({ hours: 1 }),
      usedAt: null,
    })

    assert.isTrue(await service.consume(plain, 'FreshPassword123'))
    assert.lengthOf(await PasswordResetToken.query().whereNull('used_at'), 0)
  })

  test('the reset page reports a dead link instead of 404ing', async ({ client, assert }) => {
    const good = await client.get(`/reset-password/${await mintFor('admin@driftless.local')}`)
    good.assertStatus(200)

    const bad = await client.get('/reset-password/not-a-real-token')
    bad.assertStatus(200)
    // The token is in the URL, so it must not ride along in a Referer header.
    assert.equal(bad.header('referrer-policy'), 'no-referrer')
  })

  test('an inactive account gets no reset link', async ({ assert }) => {
    const admin = await adminUser()
    admin.status = 'INACTIVE'
    await admin.save()

    assert.isNull(await service.buildReset('admin@driftless.local'))
    assert.lengthOf(await PasswordResetToken.all(), 0)
  })
})
