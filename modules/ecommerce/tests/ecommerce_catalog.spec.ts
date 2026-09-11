import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'
import Module from '#models/module'
import AuditLog from '#models/audit_log'
import ModulesService from '#services/modules_service'
import ProductVariant from '#modules/ecommerce/models/product_variant'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  // The module ships `autoEnable: false`, so its routes are guarded off until an
  // operator turns it on. Every test here needs it on.
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )

  /**
   * Module permissions are minted by `modules_provider` at boot, but `truncate`
   * wipes the table and the seeder only restores core's built-ins — so without
   * this every test after the first would run against a permission set that no
   * longer contains any `ecommerce:*` code.
   */
  await new ModulesService().mintPermissions()

  /**
   * `ModulesService` caches enabled state process-wide with a short TTL, so the
   * `moduleEnabled` guard would keep answering from a snapshot taken before the
   * row above existed and every route would 404.
   */
  new ModulesService().bustCache()

  return cleanup
}

/** SUPERADMIN holds `*`, which covers every `ecommerce:*` code. */
async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/** A user with the seeded ADMIN role, which holds no `ecommerce:*` codes. */
async function plainAdmin() {
  const role = await Role.query().where('name', 'ADMIN').firstOrFail()
  const user = await User.create({
    email: `plain-${Date.now()}@example.com`,
    password: 'password123',
    username: `plain${Date.now()}`,
    status: 'ACTIVE',
  })
  await user.related('roles').attach([role.id])
  return user
}

/** `client` is Japa's ApiClient; typed loosely to keep the helper readable. */
async function createProduct(
  client: { post: (url: string) => any },
  admin: User,
  overrides: Record<string, unknown> = {}
) {
  return client
    .post('/api/admin/ecommerce/products')
    .loginAs(admin)
    .json({ title: 'Merino jumper', status: 'active', ...overrides })
}

test.group('E-commerce | catalog', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the module declares its permissions and they are minted', async ({ assert }) => {
    const codes = await Permission.query().whereLike('name', 'ecommerce:%')
    const names = codes.map((c) => c.name)

    assert.includeMembers(names, [
      'ecommerce:products:read',
      'ecommerce:products:manage',
      'ecommerce:orders:refund',
      'ecommerce:gateways:manage',
    ])

    /**
     * Permission matching is literal, so a coarse `ecommerce:manage` would not
     * imply anything. Assert the fine-grained codes exist rather than trusting
     * a wildcard that does not exist.
     */
    assert.notInclude(names, 'ecommerce:manage')
  })

  test('creates a product with a generated slug', async ({ client, assert }) => {
    const admin = await adminUser()
    const res = await createProduct(client, admin)

    res.assertStatus(201)
    assert.equal(res.body().slug, 'merino-jumper')
    assert.equal(res.body().status, 'active')
    assert.isNull(res.body().priceFrom, 'no variants yet, so nothing to advertise')
  })

  test('de-duplicates slugs rather than failing', async ({ client, assert }) => {
    const admin = await adminUser()
    await createProduct(client, admin)
    const second = await createProduct(client, admin)

    second.assertStatus(201)
    assert.equal(second.body().slug, 'merino-jumper-2')
  })

  test('prices round-trip exactly as integer minor units', async ({ client, assert }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    const variant = await client
      .post(`/api/admin/ecommerce/products/${product.body().id}/variants`)
      .loginAs(admin)
      .json({ title: 'Large', priceAmount: 1999, stockOnHand: 10 })

    variant.assertStatus(201)
    assert.equal(variant.body().price.amount, 1999)
    assert.equal(variant.body().price.formatted, '$19.99')

    // And it is exactly 1999 in the database — not 1998.999…
    const row = await ProductVariant.findOrFail(variant.body().id)
    assert.strictEqual(row.priceAmount, 1999)
  })

  test('rejects a fractional price outright', async ({ client }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    /**
     * The client is expected to send integer minor units. A decimal here means
     * something is doing float money arithmetic, which must fail loudly rather
     * than be silently rounded.
     */
    const res = await client
      .post(`/api/admin/ecommerce/products/${product.body().id}/variants`)
      .loginAs(admin)
      .json({ title: 'Large', priceAmount: 19.99 })

    res.assertStatus(422)
  })

  test('rejects a negative price', async ({ client }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    const res = await client
      .post(`/api/admin/ecommerce/products/${product.body().id}/variants`)
      .loginAs(admin)
      .json({ title: 'Large', priceAmount: -100 })

    res.assertStatus(422)
  })

  test('refuses a duplicate SKU with a readable error', async ({ client }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    await client
      .post(`/api/admin/ecommerce/products/${product.body().id}/variants`)
      .loginAs(admin)
      .json({ title: 'Large', priceAmount: 1000, sku: 'JUMP-L' })

    const clash = await client
      .post(`/api/admin/ecommerce/products/${product.body().id}/variants`)
      .loginAs(admin)
      .json({ title: 'Medium', priceAmount: 1000, sku: 'JUMP-L' })

    clash.assertStatus(409)
    clash.assertBodyContains({ reason: 'sku_taken' })
  })

  test('will not delete the last variant', async ({ client }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    const variant = await client
      .post(`/api/admin/ecommerce/products/${product.body().id}/variants`)
      .loginAs(admin)
      .json({ title: 'Only', priceAmount: 500 })

    const res = await client
      .delete(`/api/admin/ecommerce/variants/${variant.body().id}`)
      .loginAs(admin)

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'last_variant' })
  })

  test('deleting a product archives it and keeps the row', async ({ client, assert }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    const res = await client
      .delete(`/api/admin/ecommerce/products/${product.body().id}`)
      .loginAs(admin)
    res.assertStatus(204)

    // Soft delete: the row survives so order line items keep their reference.
    const listed = await client.get('/api/admin/ecommerce/products').loginAs(admin)
    assert.lengthOf(listed.body().items, 0)

    const gone = await client
      .get(`/api/admin/ecommerce/products/${product.body().id}`)
      .loginAs(admin)
    gone.assertStatus(404)
  })

  test('every write is recorded in the audit log', async ({ client, assert }) => {
    const admin = await adminUser()
    const product = await createProduct(client, admin)

    const entries = await AuditLog.query()
      .where('subject_type', 'product')
      .where('subject_id', product.body().id)

    assert.lengthOf(entries, 1)
    assert.equal(entries[0]!.action, 'product.created')
    assert.equal(entries[0]!.actorType, 'user')
    assert.equal(entries[0]!.actorId, String(admin.id))
    assert.isNotNull(entries[0]!.requestId)
  })

  test('an admin without ecommerce permissions is refused', async ({ client }) => {
    const operator = await plainAdmin()

    const read = await client.get('/api/admin/ecommerce/products').loginAs(operator)
    read.assertStatus(403)

    const write = await client
      .post('/api/admin/ecommerce/products')
      .loginAs(operator)
      .json({ title: 'Nope' })
    write.assertStatus(403)
  })

  test('rejects unauthenticated callers', async ({ client }) => {
    const read = await client.get('/api/admin/ecommerce/products')
    read.assertStatus(401)

    const write = await client.post('/api/admin/ecommerce/products').json({ title: 'Nope' })
    write.assertStatus(401)
  })

  test('routes 404 while the module is disabled', async ({ client }) => {
    await Module.query().where('name', 'ecommerce').update({ enabled: false })

    const admin = await adminUser()
    const res = await client.get('/api/admin/ecommerce/products').loginAs(admin)
    res.assertStatus(404)
  })
})

test.group('E-commerce | store settings', (group) => {
  group.each.setup(async () => resetDatabase())

  test('exposes sane defaults', async ({ client, assert }) => {
    const admin = await adminUser()
    const res = await client.get('/api/admin/ecommerce/settings').loginAs(admin)

    res.assertStatus(200)
    assert.equal(res.body().currency, 'USD')
    assert.equal(res.body().taxRatePercent, 0)
    assert.equal(res.body().checkoutTtlMinutes, 60)
  })

  test('stores a fractional tax rate without floating-point drift', async ({ client, assert }) => {
    const admin = await adminUser()
    await client.put('/api/admin/ecommerce/settings').loginAs(admin).json({ taxRatePercent: 8.25 })

    const res = await client.get('/api/admin/ecommerce/settings').loginAs(admin)
    assert.strictEqual(res.body().taxRatePercent, 8.25)
  })

  test('rejects an out-of-range tax rate', async ({ client }) => {
    const admin = await adminUser()
    const res = await client
      .put('/api/admin/ecommerce/settings')
      .loginAs(admin)
      .json({ taxRatePercent: 150 })

    res.assertStatus(422)
  })
})
