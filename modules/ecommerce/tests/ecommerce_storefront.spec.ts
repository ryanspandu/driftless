import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'

let fake: FakeGatewayDriver

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  fake = new FakeGatewayDriver('stripe')
  overrideGateway('stripe', fake)
  await new StoreSettingsService().getOrCreate()

  return async () => {
    clearGatewayOverrides()
    await cleanup()
  }
}

/**
 * Keys that must never appear in a storefront payload, at any depth.
 *
 * Margin data, raw inventory, staff notes, credentials, and internal
 * identifiers. This is the deny-list behind the leakage sweep below — the
 * cheapest high-value test in the suite, because it catches every future DTO
 * regression automatically rather than needing a new test each time.
 */
const FORBIDDEN_KEYS = [
  'costAmount',
  'cost_amount',
  'stockOnHand',
  'stock_on_hand',
  'stockReserved',
  'stock_reserved',
  'internalNote',
  'internal_note',
  'passwordHash',
  'password_hash',
  'tokenHash',
  'token_hash',
  'accessTokenHash',
  'access_token_hash',
  'idempotencyKey',
  'idempotency_key',
  'secretKey',
  'secret_key_enc',
  'webhookSecret',
  'webhook_secret_enc',
  'ipHash',
  'ip_hash',
  'gatewayPaymentId',
  'gateway_payment_id',
]

/** Walk a payload and collect every forbidden key found, with its path. */
function findForbiddenKeys(value: unknown, path = '$'): string[] {
  if (value === null || typeof value !== 'object') return []

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`))
  }

  const hits: string[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(key)) hits.push(`${path}.${key}`)
    hits.push(...findForbiddenKeys(child, `${path}.${key}`))
  }
  return hits
}

async function seedProduct(price = 1999, stock = 10) {
  const product = await Product.create({
    id: newUlid(),
    slug: 'test-product',
    title: 'Test product',
    description: {},
    type: 'physical',
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: true,
    position: 0,
    priceFromAmount: price,
  })

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    sku: 'SKU-1',
    priceAmount: price,
    // Deliberately populated: these are exactly what must not leak.
    costAmount: 500,
    optionValues: {},
    stockOnHand: stock,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

test.group('E-commerce | storefront catalogue', (group) => {
  group.each.setup(async () => resetDatabase())

  test('lists only active products', async ({ client, assert }) => {
    await seedProduct()
    await Product.create({
      id: newUlid(),
      slug: 'draft-product',
      title: 'Not for sale',
      description: {},
      type: 'physical',
      status: 'draft',
      currency: 'USD',
      seo: {},
      options: [],
      featured: false,
      position: 0,
    })

    const res = await client.get('/api/shop/products')
    res.assertStatus(200)
    assert.lengthOf(res.body().items, 1)
    assert.equal(res.body().items[0].slug, 'test-product')
  })

  test('404s for a draft product by slug', async ({ client }) => {
    await Product.create({
      id: newUlid(),
      slug: 'hidden',
      title: 'Hidden',
      description: {},
      type: 'physical',
      status: 'draft',
      currency: 'USD',
      seo: {},
      options: [],
      featured: false,
      position: 0,
    })

    const res = await client.get('/api/shop/products/hidden')
    res.assertStatus(404)
  })

  test('reports availability as a bucket, not an exact count', async ({ client, assert }) => {
    await seedProduct(1999, 50)

    const res = await client.get('/api/shop/products/test-product')
    res.assertStatus(200)

    const variant = res.body().variants[0]
    assert.equal(variant.availability, 'in_stock')
    /**
     * Exact stock is competitive intelligence. Above the low-stock threshold
     * the wire carries no number at all.
     */
    assert.isNull(variant.remaining)
  })

  test('gives a count only when stock is genuinely low', async ({ client, assert }) => {
    await seedProduct(1999, 3)

    const res = await client.get('/api/shop/products/test-product')
    const variant = res.body().variants[0]

    assert.equal(variant.availability, 'low_stock')
    assert.equal(variant.remaining, 3)
  })

  test('reports out of stock rather than hiding the product', async ({ client, assert }) => {
    await seedProduct(1999, 0)

    const res = await client.get('/api/shop/products/test-product')
    assert.equal(res.body().variants[0].availability, 'out_of_stock')
  })

  test('caps the page size an anonymous caller can ask for', async ({ client, assert }) => {
    await seedProduct()

    const res = await client.get('/api/shop/products?pageSize=10000')
    assert.isAtMost(res.body().pageSize, 48, 'the catalogue cannot be drained in one request')
  })
})

test.group('E-commerce | storefront leakage sweep', (group) => {
  group.each.setup(async () => resetDatabase())

  /**
   * The single most valuable test here: it walks the *whole* response of every
   * public endpoint and fails on any forbidden key at any depth. A future DTO
   * change that accidentally exposes cost or stock is caught without anyone
   * having to remember to write a test for it.
   */
  test('no public endpoint leaks internal fields', async ({ client, assert }) => {
    const { variant } = await seedProduct()

    const responses: { label: string; body: unknown }[] = []

    responses.push({ label: 'products', body: (await client.get('/api/shop/products')).body() })
    responses.push({
      label: 'product detail',
      body: (await client.get('/api/shop/products/test-product')).body(),
    })
    responses.push({ label: 'categories', body: (await client.get('/api/shop/categories')).body() })
    responses.push({ label: 'me', body: (await client.get('/api/shop/me')).body() })

    const added = await client
      .post('/api/shop/cart/items')
      .json({ variantId: variant.id, quantity: 2 })
    responses.push({ label: 'cart add', body: added.body() })

    responses.push({ label: 'cart read', body: (await client.get('/api/shop/cart')).body() })

    responses.push({
      label: 'availability',
      body: (await client.post('/api/shop/availability').json({ ids: [variant.id] })).body(),
    })

    for (const { label, body } of responses) {
      const hits = findForbiddenKeys(body)
      assert.deepEqual(hits, [], `${label} leaked: ${hits.join(', ')}`)
    }
  })

  test('the SKU-level cost never reaches a shopper', async ({ client, assert }) => {
    await seedProduct()
    const res = await client.get('/api/shop/products/test-product')

    // Belt and braces: the value itself, not just the key name.
    assert.notInclude(JSON.stringify(res.body()), '500')
  })
})

test.group('E-commerce | storefront cart', (group) => {
  group.each.setup(async () => resetDatabase())

  test('adds, updates and clears', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 10)

    const added = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    added.assertStatus(200)
    assert.equal(added.body().itemCount, 1)
    assert.equal(added.body().total.amount, 1999)

    const cookie = added.headers()['set-cookie']
    assert.isDefined(cookie, 'a cart cookie is issued')

    const updated = await client
      .put('/api/shop/cart/items')
      .withCookie('dl_cart', added.cookie('dl_cart')?.value ?? '')
      .json({ variantId: variant.id, quantity: 3 })

    updated.assertStatus(200)
    assert.equal(updated.body().itemCount, 3)
    assert.equal(updated.body().total.amount, 5997)
  })

  test('adding the same variant twice bumps the quantity', async ({ client, assert }) => {
    const { variant } = await seedProduct()

    const first = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    const token = first.cookie('dl_cart')?.value ?? ''

    const second = await client
      .post('/api/shop/cart/items')
      .withCookie('dl_cart', token)
      .json({ variantId: variant.id })

    assert.equal(second.body().itemCount, 2)
    assert.lengthOf(second.body().lines, 1, 'one line, not two')
  })

  test('rejects an absurd quantity', async ({ client }) => {
    const { variant } = await seedProduct()

    const res = await client
      .post('/api/shop/cart/items')
      .json({ variantId: variant.id, quantity: 100_000 })

    res.assertStatus(422)
  })

  test('refuses to add a draft product', async ({ client }) => {
    const product = await Product.create({
      id: newUlid(),
      slug: 'draft',
      title: 'Draft',
      description: {},
      type: 'physical',
      status: 'draft',
      currency: 'USD',
      seo: {},
      options: [],
      featured: false,
      position: 0,
    })
    const variant = await ProductVariant.create({
      id: newUlid(),
      productId: product.id,
      title: 'Default',
      priceAmount: 1000,
      optionValues: {},
      stockOnHand: 5,
      stockReserved: 0,
      trackInventory: true,
      allowBackorder: false,
      position: 0,
    })

    const res = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    res.assertStatus(404)
  })

  test('one shopper cannot see another basket', async ({ client, assert }) => {
    const { variant } = await seedProduct()

    const mine = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    assert.equal(mine.body().itemCount, 1)

    /**
     * No cookie at all: a fresh caller gets a fresh, empty basket. Cart
     * identity lives in a random token, so there is no id to guess.
     */
    const theirs = await client.get('/api/shop/cart')
    assert.equal(theirs.body().itemCount, 0)
  })
})

test.group('E-commerce | storefront checkout', (group) => {
  group.each.setup(async () => resetDatabase())

  test('requires an idempotency key', async ({ client }) => {
    const { variant } = await seedProduct()
    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })

    const res = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cart.cookie('dl_cart')?.value ?? '')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    res.assertStatus(400)
    res.assertBodyContains({ reason: 'idempotency_key_required' })
  })

  test('creates an order and returns a redirect', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    const token = cart.cookie('dl_cart')?.value ?? ''

    const res = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', token)
      .header('idempotency-key', 'key-1')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    res.assertStatus(201)
    assert.equal(res.body().total.amount, 1999)
    assert.isString(res.body().redirectUrl)
    assert.isString(res.body().accessToken)

    const order = await Order.findOrFail(res.body().orderId)
    assert.equal(order.paymentStatus, 'unpaid')

    // The basket is emptied — pressing back must not let someone pay twice.
    const after = await client.get('/api/shop/cart').withCookie('dl_cart', token)
    assert.equal(after.body().itemCount, 0)
  })

  test('replays the same response for a retried request', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })
    const token = cart.cookie('dl_cart')?.value ?? ''

    const body = { email: 'buyer@example.com', gateway: 'stripe' as const }

    const first = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', token)
      .header('idempotency-key', 'retry-key')
      .json(body)

    const second = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', token)
      .header('idempotency-key', 'retry-key')
      .json(body)

    assert.equal(first.body().orderId, second.body().orderId, 'one order, not two')

    const orders = await Order.query().count('* as total')
    assert.equal(Number((orders[0] as never as { $extras: { total: string } }).$extras.total), 1)
  })

  test('refuses an empty basket', async ({ client }) => {
    const res = await client
      .post('/api/shop/checkout')
      .header('idempotency-key', 'empty-key')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'empty_basket' })
  })

  test('order status needs a valid token and reveals nothing without one', async ({ client }) => {
    const missing = await client.get('/api/shop/order')
    missing.assertStatus(400)

    /**
     * A wrong token and a non-existent order return the same 404 — probing with
     * random tokens teaches an attacker nothing about which ones exist.
     */
    const wrong = await client.get('/api/shop/order?token=not-a-real-token')
    wrong.assertStatus(404)
  })

  test('shows the order to whoever holds the access token', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })

    const checkout = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cart.cookie('dl_cart')?.value ?? '')
      .header('idempotency-key', 'status-key')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    const res = await client.get(`/api/shop/order?token=${checkout.body().accessToken}`)
    res.assertStatus(200)
    assert.equal(res.body().paid, false)
    assert.equal(res.body().total.amount, 1999)
    assert.lengthOf(res.body().items, 1)

    // …and it carries nothing that would matter if the link leaked.
    assert.deepEqual(findForbiddenKeys(res.body()), [])
  })

  test('confirms from the gateway when the webhook has not landed', async ({ client, assert }) => {
    const { variant } = await seedProduct(1999, 5)
    const cart = await client.post('/api/shop/cart/items').json({ variantId: variant.id })

    const checkout = await client
      .post('/api/shop/checkout')
      .withCookie('dl_cart', cart.cookie('dl_cart')?.value ?? '')
      .header('idempotency-key', 'pull-key')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    // The buyer paid and came straight back; no webhook yet.
    fake.markPaid([...fake.sessions.keys()][0]!)

    const res = await client.get(`/api/shop/order?token=${checkout.body().accessToken}`)
    assert.isTrue(res.body().paid, 'the return page pulls status from the gateway')

    const order = await Order.findOrFail(checkout.body().orderId)
    assert.equal(order.paymentStatus, 'paid')
  })
})

test.group('E-commerce | storefront accounts', (group) => {
  group.each.setup(async () => resetDatabase())

  test('registering does not disclose whether the address is taken', async ({ client, assert }) => {
    const first = await client
      .post('/api/shop/account/register')
      .json({ email: 'buyer@example.com', password: 'correct horse battery' })
    first.assertStatus(201)

    const second = await client
      .post('/api/shop/account/register')
      .json({ email: 'buyer@example.com', password: 'different password here' })

    /**
     * Same status, same message. The only difference is the absence of a
     * session, which an attacker cannot observe from the response body.
     */
    second.assertStatus(201)
    assert.equal(first.body().message, second.body().message)
  })

  test('login failures are indistinguishable', async ({ client, assert }) => {
    await client
      .post('/api/shop/account/register')
      .json({ email: 'real@example.com', password: 'the real password' })

    const wrongPassword = await client
      .post('/api/shop/account/login')
      .json({ email: 'real@example.com', password: 'wrong password here' })

    const unknownEmail = await client
      .post('/api/shop/account/login')
      .json({ email: 'nobody@example.com', password: 'the real password' })

    assert.equal(wrongPassword.status(), unknownEmail.status())
    assert.deepEqual(wrongPassword.body(), unknownEmail.body())
  })

  test('signs in and reads its own orders', async ({ client, assert }) => {
    const registered = await client
      .post('/api/shop/account/register')
      .json({ email: 'shopper@example.com', password: 'correct horse battery' })

    const cookie = registered.cookie('dl_shop')?.value ?? ''
    assert.isNotEmpty(cookie, 'a storefront session cookie is issued')

    const me = await client.get('/api/shop/me').withCookie('dl_shop', cookie)
    assert.equal(me.body().customer.email, 'shopper@example.com')

    const orders = await client.get('/api/shop/account/orders').withCookie('dl_shop', cookie)
    orders.assertStatus(200)
    assert.deepEqual(orders.body().orders, [])
  })

  test('a storefront session grants nothing in the admin area', async ({ client, assert }) => {
    const registered = await client
      .post('/api/shop/account/register')
      .json({ email: 'shopper2@example.com', password: 'correct horse battery' })

    const cookie = registered.cookie('dl_shop')?.value ?? ''

    /**
     * The structural guarantee: a customer has no row in `users`, so no admin
     * guard can ever resolve one. The cookie is not even the same name.
     */
    for (const url of ['/api/me', '/api/admin/ecommerce/orders', '/api/admin/users']) {
      const res = await client.get(url).withCookie('dl_shop', cookie)
      assert.notEqual(res.status(), 200, `${url} must not be reachable with a shop session`)
    }
  })

  test('order history requires a session', async ({ client }) => {
    const res = await client.get('/api/shop/account/orders')
    res.assertStatus(401)
  })

  test('logging out revokes the session', async ({ client, assert }) => {
    const registered = await client
      .post('/api/shop/account/register')
      .json({ email: 'bye@example.com', password: 'correct horse battery' })

    const cookie = registered.cookie('dl_shop')?.value ?? ''

    await client.post('/api/shop/account/logout').withCookie('dl_shop', cookie)

    // The same token must no longer resolve, even though the browser still has it.
    const me = await client.get('/api/shop/me').withCookie('dl_shop', cookie)
    assert.isNull(me.body().customer)
  })
})

test.group('E-commerce | storefront pages', (group) => {
  group.each.setup(async () => resetDatabase())

  test('cart, checkout and order pages render for anyone', async ({ client }) => {
    for (const path of ['/shop/cart', '/shop/checkout', '/shop/order']) {
      const res = await client.get(path)
      res.assertStatus(200)
    }
  })

  test('only gateways with usable credentials are offered', async ({ assert }) => {
    const { default: GatewayCredentialsService } =
      await import('#modules/ecommerce/services/gateway_credentials_service')
    const service = new GatewayCredentialsService()

    /**
     * The checkout page decides this server-side rather than trusting the
     * client — otherwise a shopper could pick a gateway the store cannot
     * actually charge through.
     */
    assert.deepEqual(await service.enabledGateways(), [])

    // A key on its own is not enough: the gateway must also be switched on.
    await service.update('stripe', 'test', { secretKey: 'sk_test_x' })
    assert.deepEqual(await service.enabledGateways(), [])

    await service.update('stripe', 'test', { enabled: true })
    assert.deepEqual(await service.enabledGateways(), ['stripe'])
  })

  test('an unknown /shop path 404s instead of falling through to the CMS', async ({ client }) => {
    /**
     * `shop` is a reserved first segment in `pages_public_controller`, so a
     * builder page cannot be authored at a path the storefront owns — it would
     * be permanently shadowed by these routes and never render.
     */
    const res = await client.get('/shop/not-a-real-page')
    res.assertStatus(404)
  })
})

test.group('E-commerce | storefront module gate', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the shop closes when the module is disabled', async ({ client }) => {
    await Module.query().where('name', 'ecommerce').update({ enabled: false })
    new ModulesService().bustCache()

    /**
     * A disabled store must stop taking orders. Webhooks are deliberately
     * exempt from this gate — money already in flight still has to be recorded.
     */
    const products = await client.get('/api/shop/products')
    products.assertStatus(404)

    const checkout = await client
      .post('/api/shop/checkout')
      .header('idempotency-key', 'gate-key')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })
    checkout.assertStatus(404)
  })
})
