import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import Customer from '#modules/ecommerce/models/customer'
import CustomerAuthService from '#modules/ecommerce/services/customer_auth_service'

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

/** SUPERADMIN holds `*`, which covers `ecommerce:customers:manage`. */
async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

const auth = () => new CustomerAuthService()

test.group('E-commerce | admin creates a customer', (group) => {
  group.each.setup(async () => resetDatabase())

  test('creates a record-only customer with no password', async ({ assert }) => {
    const customer = await auth().adminCreate({ email: 'Buyer@Example.com', firstName: 'Ada' })

    // Email is normalised, no password, active by default.
    assert.equal(customer.email, 'buyer@example.com')
    assert.isNull(customer.passwordHash)
    assert.equal(customer.firstName, 'Ada')
    assert.equal(customer.status, 'active')

    // A record-only customer cannot sign in.
    const signedIn = await auth().verify('buyer@example.com', 'whatever-they-try')
    assert.isNull(signedIn)
  })

  test('a customer given a password can sign in', async ({ assert }) => {
    await auth().adminCreate({ email: 'signs-in@example.com', password: 'correct horse battery' })

    const signedIn = await auth().verify('signs-in@example.com', 'correct horse battery')
    assert.isNotNull(signedIn)
  })

  test('rejects a duplicate email outright (not enumeration-resistant like register)', async ({
    assert,
  }) => {
    await auth().adminCreate({ email: 'taken@example.com' })

    await assert.rejects(() => auth().adminCreate({ email: 'taken@example.com' }))
    const count = await Customer.query().where('email', 'taken@example.com').count('* as total')
    assert.equal(Number((count[0] as unknown as { $extras: { total: number } }).$extras.total), 1)
  })

  test('rejects a password shorter than 8 characters', async ({ assert }) => {
    await assert.rejects(() => auth().adminCreate({ email: 'short@example.com', password: 'abc' }))
  })

  test('the endpoint creates a customer and returns its DTO', async ({ client, assert }) => {
    const admin = await adminUser()
    const res = await client
      .post('/api/admin/ecommerce/customers')
      .loginAs(admin)
      .json({ email: 'via-api@example.com', firstName: 'Grace', acceptsMarketing: true })

    res.assertStatus(201)
    assert.equal(res.body().email, 'via-api@example.com')
    assert.isTrue(res.body().isGuest, 'no password given, so it is a record-only customer')
    assert.isTrue(res.body().acceptsMarketing)
    assert.isNotNull(await Customer.query().where('email', 'via-api@example.com').first())
  })

  test('the endpoint is guarded by auth', async ({ client }) => {
    const res = await client
      .post('/api/admin/ecommerce/customers')
      .json({ email: 'nope@example.com' })

    res.assertStatus(401)
  })
})
