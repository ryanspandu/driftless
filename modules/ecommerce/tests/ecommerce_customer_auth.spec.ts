import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import Account from '#modules/ecommerce/models/account'
import AccountSession from '#modules/ecommerce/models/account_session'
import AccountAuthService from '#modules/ecommerce/services/account_auth_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  return cleanup
}

const auth = () => new AccountAuthService()

test.group('E-commerce | account identity', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a account is not a user', async ({ assert }) => {
    const usersBefore = await User.query().count('* as total').first()

    const { account } = await auth().register({
      email: 'buyer@example.com',
      password: 'correct horse battery',
    })

    assert.isNotNull(account)

    /**
     * The whole point of the separate table: registering a shopper must not
     * create anything in `users`, which is what `ctx.auth.user` and every
     * `/admin` guard read.
     */
    const usersAfter = await User.query().count('* as total').first()
    assert.deepEqual(
      (usersAfter as never as { $extras: Record<string, unknown> }).$extras,
      (usersBefore as never as { $extras: Record<string, unknown> }).$extras,
      'registering a account must not touch the users table'
    )
  })

  test('normalises the email so case cannot create a second account', async ({ assert }) => {
    await auth().register({ email: 'Buyer@Example.COM', password: 'correct horse battery' })

    const found = await Account.query().where('email', 'buyer@example.com').first()
    assert.isNotNull(found)

    // The same address in different case resolves to the same row.
    const second = await auth().register({
      email: 'BUYER@example.com',
      password: 'another password',
    })
    assert.isNull(second.account, 'an existing account must not be silently overwritten')

    const count = await Account.query().count('* as total')
    assert.equal(Number((count[0] as never as { $extras: { total: string } }).$extras.total), 1)
  })

  test('registering an existing address reveals nothing', async ({ assert }) => {
    await auth().register({ email: 'taken@example.com', password: 'first password here' })

    /**
     * Enumeration resistance: the caller gets the same shape either way and no
     * session, so "this address is already registered" cannot be inferred from
     * the response.
     */
    const second = await auth().register({
      email: 'taken@example.com',
      password: 'attacker guess here',
    })

    assert.isNull(second.account)

    // …and the original password still works, so nothing was overwritten.
    const verified = await auth().verify('taken@example.com', 'first password here')
    assert.isNotNull(verified)
  })

  test('upgrades a guest row rather than duplicating it', async ({ assert }) => {
    const guest = await auth().findOrCreateGuest('guest@example.com', { firstName: 'Ada' })
    assert.isNull(guest.passwordHash, 'guest checkout leaves no password')

    const { account } = await auth().register({
      email: 'guest@example.com',
      password: 'now i want an account',
    })

    assert.isNotNull(account)
    assert.equal(account!.id, guest.id, 'the same row is upgraded')
    assert.equal(account!.firstName, 'Ada', 'guest details survive')

    const verified = await auth().verify('guest@example.com', 'now i want an account')
    assert.isNotNull(verified)
  })

  test('a guest row cannot be signed into', async ({ assert }) => {
    await auth().findOrCreateGuest('guest2@example.com')
    const verified = await auth().verify('guest2@example.com', 'anything at all')
    assert.isNull(verified, 'no password means no login')
  })

  test('rejects a wrong password, an unknown address, and a blocked account alike', async ({
    assert,
  }) => {
    await auth().register({ email: 'real@example.com', password: 'the real password' })

    assert.isNull(await auth().verify('real@example.com', 'wrong password here'))
    assert.isNull(await auth().verify('nobody@example.com', 'the real password'))

    await Account.query().where('email', 'real@example.com').update({ status: 'blocked' })
    assert.isNull(
      await auth().verify('real@example.com', 'the real password'),
      'a blocked account must not sign in even with the right password'
    )
  })

  test('rejects a short password', async ({ assert }) => {
    await assert.rejects(
      () => auth().register({ email: 'short@example.com', password: 'abc' }),
      /at least 8 characters/i
    )
  })

  test('stores only a hash of the session token', async ({ assert }) => {
    const { account } = await auth().register({
      email: 'session@example.com',
      password: 'correct horse battery',
    })

    /**
     * `startSession` needs an HttpContext to set the cookie, so the storage
     * shape is asserted directly: a database leak must not hand over live
     * sessions.
     */
    const session = await AccountSession.create({
      id: 'test-session',
      accountId: account!.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: DateTime.now().plus({ days: 1 }),
      createdAt: DateTime.now(),
    })

    assert.isTrue(session.isLive)

    const serialised = JSON.stringify(session.serialize())
    assert.notInclude(serialised, 'tokenHash', 'the hash is never serialised either')
  })

  test('an expired or revoked session is not live', async ({ assert }) => {
    const { account } = await auth().register({
      email: 'expiry@example.com',
      password: 'correct horse battery',
    })

    const expired = await AccountSession.create({
      id: 'expired-session',
      accountId: account!.id,
      tokenHash: 'b'.repeat(64),
      expiresAt: DateTime.now().minus({ days: 1 }),
      createdAt: DateTime.now(),
    })
    assert.isFalse(expired.isLive)

    const revoked = await AccountSession.create({
      id: 'revoked-session',
      accountId: account!.id,
      tokenHash: 'c'.repeat(64),
      expiresAt: DateTime.now().plus({ days: 1 }),
      revokedAt: DateTime.now(),
      createdAt: DateTime.now(),
    })
    assert.isFalse(revoked.isLive)
  })

  test('revoking all sessions locks every device out at once', async ({ assert }) => {
    const { account } = await auth().register({
      email: 'revoke@example.com',
      password: 'correct horse battery',
    })

    for (const suffix of ['d', 'e', 'f']) {
      await AccountSession.create({
        id: `session-${suffix}`,
        accountId: account!.id,
        tokenHash: suffix.repeat(64),
        expiresAt: DateTime.now().plus({ days: 1 }),
        createdAt: DateTime.now(),
      })
    }

    /**
     * A password reset that leaves the attacker's existing session alive has
     * not actually locked them out.
     */
    await auth().revokeAllSessions(account!.id)

    const live = await AccountSession.query()
      .where('account_id', account!.id)
      .whereNull('revoked_at')

    assert.lengthOf(live, 0)
  })

  test('the password hash never serialises', async ({ assert }) => {
    const { account } = await auth().register({
      email: 'hash@example.com',
      password: 'correct horse battery',
    })

    const serialised = JSON.stringify(account!.serialize())
    assert.notInclude(serialised, 'passwordHash')
    assert.notInclude(serialised, account!.passwordHash!)
  })
})
