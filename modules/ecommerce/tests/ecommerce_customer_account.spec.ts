import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Account from '#modules/ecommerce/models/account'
import AccountSession from '#modules/ecommerce/models/account_session'
import AccountAuthService, { toAccountDto } from '#modules/ecommerce/services/account_auth_service'
import CustomerAddressService from '#modules/ecommerce/services/customer_address_service'

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

async function makeCustomer(email: string, password: string | null = null) {
  return Account.create({
    id: newUlid(),
    email,
    passwordHash: password ? await hash.make(password) : null,
    status: 'active',
    acceptsMarketing: false,
    ordersCount: 0,
    totalSpentAmount: 0,
  })
}

const auth = () => new AccountAuthService()
const book = () => new CustomerAddressService()

const addr = (over: Record<string, unknown> = {}) => ({
  line1: '1 Test St',
  city: 'Testville',
  country: 'US',
  ...over,
})

test.group('E-commerce | account address book', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the first saved address becomes the default for both roles', async ({ assert }) => {
    const c = await makeCustomer('a@example.com')
    const created = await book().create(c.id, addr({ label: 'Home' }))

    assert.isTrue(created.isDefaultShipping)
    assert.isTrue(created.isDefaultBilling)
    assert.equal(created.country, 'US')
  })

  test('setting a new default clears it from the previous one', async ({ assert }) => {
    const c = await makeCustomer('b@example.com')
    const first = await book().create(c.id, addr({ label: 'Home' }))
    const second = await book().create(c.id, addr({ label: 'Work', isDefaultShipping: true }))

    const list = await book().list(c.id)
    const firstNow = list.find((a) => a.id === first.id)!
    const secondNow = list.find((a) => a.id === second.id)!

    assert.isFalse(firstNow.isDefaultShipping, 'the old default shipping is cleared')
    assert.isTrue(secondNow.isDefaultShipping, 'exactly one default shipping remains')
  })

  test('addresses are scoped to their owner', async ({ assert }) => {
    const a = await makeCustomer('owner@example.com')
    const b = await makeCustomer('other@example.com')
    const owned = await book().create(a.id, addr())

    // B cannot see, edit, or delete A's address.
    assert.isEmpty(await book().list(b.id))
    await assert.rejects(() => book().update(b.id, owned.id, { city: 'Hacktown' }))
    await assert.rejects(() => book().remove(b.id, owned.id))
  })

  test('update edits fields; remove soft-deletes', async ({ assert }) => {
    const c = await makeCustomer('c@example.com')
    const a = await book().create(c.id, addr())

    const updated = await book().update(c.id, a.id, { city: 'Newville', line2: 'Flat 2' })
    assert.equal(updated.city, 'Newville')
    assert.equal(updated.line2, 'Flat 2')

    await book().remove(c.id, a.id)
    assert.isEmpty(await book().list(c.id))
  })
})

test.group('E-commerce | account profile & password', (group) => {
  group.each.setup(async () => resetDatabase())

  test('updateProfile persists name, phone and marketing preference', async ({ assert }) => {
    const c = await makeCustomer('p@example.com', 'correct horse battery')
    await auth().updateProfile(c, {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+15551234',
      acceptsMarketing: true,
    })

    const fresh = await Account.findOrFail(c.id)
    assert.equal(fresh.firstName, 'Ada')
    assert.equal(fresh.phone, '+15551234')
    assert.isTrue(fresh.acceptsMarketing)
  })

  test('changePassword rejects a guest (no password) and a wrong current', async ({ assert }) => {
    const guest = await makeCustomer('guest@example.com') // no password
    await assert.rejects(() => auth().changePassword(guest, 'anything', 'new-password-1'))

    const c = await makeCustomer('member@example.com', 'the-old-password')
    await assert.rejects(() => auth().changePassword(c, 'wrong-current', 'new-password-1'))
  })

  test('changePassword sets the new password and revokes every session', async ({ assert }) => {
    const c = await makeCustomer('rotate@example.com', 'the-old-password')
    // Two live sessions, as if signed in on two devices.
    for (let i = 0; i < 2; i++) {
      await AccountSession.create({
        id: newUlid(),
        accountId: c.id,
        tokenHash: `hash-${i}`,
        expiresAt: DateTime.now().plus({ days: 30 }),
      })
    }

    await auth().changePassword(c, 'the-old-password', 'brand-new-password')

    const fresh = await Account.findOrFail(c.id)
    assert.isTrue(await hash.verify(fresh.passwordHash!, 'brand-new-password'))

    const live = await AccountSession.query().where('account_id', c.id).whereNull('revoked_at')
    assert.isEmpty(live, 'every session is revoked on password change')
  })
})

test.group('E-commerce | widened account DTO', (group) => {
  group.each.setup(async () => resetDatabase())

  test('carries phone, member-since, has-password, and total spent when priced', async ({
    assert,
  }) => {
    const c = await makeCustomer('dto@example.com', 'a-password')
    c.phone = '+15550000'
    c.totalSpentAmount = 12_345
    await c.save()

    const withMoney = toAccountDto(c, { currency: 'USD', locale: 'en-US' })
    assert.equal(withMoney.phone, '+15550000')
    assert.isTrue(withMoney.hasPassword)
    assert.isNotNull(withMoney.memberSince)
    assert.equal(withMoney.totalSpent?.amount, 12_345)
    assert.equal(withMoney.totalSpent?.formatted, '$123.45')

    // Without currency/locale (login/register responses) totalSpent is omitted.
    const withoutMoney = toAccountDto(c)
    assert.isNull(withoutMoney.totalSpent)
  })
})
