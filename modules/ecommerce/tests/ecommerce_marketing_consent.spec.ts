import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Cart from '#modules/ecommerce/models/cart'
import Customer from '#modules/ecommerce/models/customer'
import MarketingConsentService from '#modules/ecommerce/services/marketing_consent_service'
import OrderNotifierService from '#modules/ecommerce/services/order_notifier_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import MailSettingsService from '#services/mail_settings_service'
import MailDispatcher from '#services/mail_dispatcher'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()
  await new StoreSettingsService().getOrCreate()

  /**
   * Point mail at a host that does not exist.
   *
   * `sendBasketReminders` returns early when no SMTP is configured — correct in
   * production, because stamping a basket as reminded without sending would
   * lose the reminder forever. But it also means an unconfigured test suite
   * exercises none of the consent logic and passes vacuously.
   *
   * Configuring an unreachable host makes the real path run: every guard is
   * evaluated, and the send itself fails, which the loop is written to survive.
   */
  const mail = await new MailSettingsService().getOrCreate()
  mail.enabled = true
  mail.host = '127.0.0.1'
  mail.port = 1
  mail.fromAddress = 'shop@example.test'
  mail.fromName = 'Shop'
  await mail.save()
  MailDispatcher.resetCache()

  return cleanup
}

async function seedCustomer(overrides: Partial<Customer> = {}) {
  return Customer.create({
    id: newUlid(),
    email: `c-${newUlid().toLowerCase().slice(-8)}@example.com`,
    status: 'active',
    acceptsMarketing: true,
    ordersCount: 0,
    totalSpentAmount: 0,
    ...overrides,
  } as never)
}

/** A cart that is old enough to count as abandoned. */
async function seedAbandonedCart(customerId: string | null) {
  const product = await Product.create({
    id: newUlid(),
    slug: `p-${newUlid().toLowerCase().slice(-8)}`,
    title: 'Test product',
    description: {},
    type: 'physical',
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: false,
    position: 0,
    priceFromAmount: 5_000,
  })

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: 5_000,
    optionValues: {},
    stockOnHand: 10,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  const cart = await Cart.create({
    id: newUlid(),
    tokenHash: 'a'
      .repeat(64)
      .slice(0, 64)
      .replace(/a/g, () => 'b'),
    customerId,
    currency: 'USD',
    expiresAt: DateTime.now().plus({ days: 7 }),
  })

  await db.table('ecommerce_cart_items').insert({
    id: newUlid(),
    cart_id: cart.id,
    variant_id: variant.id,
    quantity: 1,
    created_at: DateTime.now().toSQL(),
    updated_at: DateTime.now().toSQL(),
  })

  // Age it past the checkout window.
  await db
    .from('ecommerce_carts')
    .where('id', cart.id)
    .update({ updated_at: DateTime.now().minus({ days: 2 }).toSQL() })

  return cart
}

test.group('E-commerce | marketing consent', (group) => {
  group.each.setup(async () => resetDatabase())

  test('may email someone who opted in', async ({ assert }) => {
    const customer = await seedCustomer({ acceptsMarketing: true } as never)
    assert.isTrue(new MarketingConsentService().mayEmail(customer))
  })

  test('may not email someone who never opted in', async ({ assert }) => {
    const customer = await seedCustomer({ acceptsMarketing: false } as never)
    assert.isFalse(new MarketingConsentService().mayEmail(customer))
  })

  test('an unsubscribe outlives the opt-in flag being flipped back', async ({ assert }) => {
    const service = new MarketingConsentService()
    const customer = await seedCustomer()

    const token = await service.unsubscribeToken(customer)
    await service.unsubscribe(token)
    await customer.refresh()

    assert.isFalse(service.mayEmail(customer))

    /**
     * An admin editing a profile must not silently resurrect consent. The
     * date is the record; the flag alone is not enough.
     */
    customer.acceptsMarketing = true
    await customer.save()
    await customer.refresh()

    assert.isFalse(service.mayEmail(customer))
  })

  test('may not email a blocked customer', async ({ assert }) => {
    const customer = await seedCustomer()
    customer.status = 'blocked'
    await customer.save()

    assert.isFalse(new MarketingConsentService().mayEmail(customer))
  })

  test('the opt-out token is minted once and reused', async ({ assert }) => {
    const service = new MarketingConsentService()
    const customer = await seedCustomer()

    const first = await service.unsubscribeToken(customer)
    const second = await service.unsubscribeToken(customer)

    assert.equal(first, second)
    assert.isAtLeast(first.length, 20)
  })

  test('unsubscribing with a bad token changes nothing and says nothing', async ({ assert }) => {
    const service = new MarketingConsentService()
    const customer = await seedCustomer()

    // Must not throw and must not report whether it matched.
    await service.unsubscribe('not-a-real-token')
    await customer.refresh()

    assert.isTrue(customer.acceptsMarketing)
  })

  test('the unsubscribe page answers the same either way', async ({ client, assert }) => {
    const service = new MarketingConsentService()
    const customer = await seedCustomer()
    const token = await service.unsubscribeToken(customer)

    const real = await client.get(`/shop/unsubscribe?token=${encodeURIComponent(token)}`)
    const fake = await client.get('/shop/unsubscribe?token=nonsense')

    /**
     * A response that distinguished them would let someone check which
     * addresses the shop holds.
     */
    assert.equal(real.status(), fake.status())
    assert.equal(real.header('cache-control'), 'no-store')

    await customer.refresh()
    assert.isFalse(customer.acceptsMarketing)
  })
})

test.group('E-commerce | basket reminders', (group) => {
  group.each.setup(async () => resetDatabase())

  test('never emails a guest basket', async ({ assert }) => {
    await seedAbandonedCart(null)

    /**
     * A guest basket carries no consent at all. The sweep only ever looks at
     * carts with a customer on them.
     */
    const sent = await new OrderNotifierService().sendBasketReminders()
    assert.equal(sent, 0)
  })

  test('never emails someone who did not opt in', async ({ assert }) => {
    const customer = await seedCustomer({ acceptsMarketing: false } as never)
    const cart = await seedAbandonedCart(customer.id)

    const sent = await new OrderNotifierService().sendBasketReminders()
    assert.equal(sent, 0)

    /**
     * Still stamped, so the basket is not re-examined forever — and so opting
     * in later does not trigger a reminder about a months-old basket.
     */
    await cart.refresh()
    assert.isNotNull(cart.remindedAt)
  })

  test('never emails someone who unsubscribed', async ({ assert }) => {
    const service = new MarketingConsentService()
    const customer = await seedCustomer()
    await service.unsubscribe(await service.unsubscribeToken(customer))
    await seedAbandonedCart(customer.id)

    assert.equal(await new OrderNotifierService().sendBasketReminders(), 0)
  })

  test('leaves a basket that is still being filled alone', async ({ assert }) => {
    const customer = await seedCustomer()
    const cart = await seedAbandonedCart(customer.id)

    // Touched just now — the shopper is still deciding.
    await db
      .from('ecommerce_carts')
      .where('id', cart.id)
      .update({ updated_at: DateTime.now().toSQL() })

    assert.equal(await new OrderNotifierService().sendBasketReminders(), 0)

    await cart.refresh()
    assert.isNull(cart.remindedAt)
  })

  test('reminds a basket at most once', async ({ assert }) => {
    const customer = await seedCustomer()
    const cart = await seedAbandonedCart(customer.id)

    const notifier = new OrderNotifierService()
    await notifier.sendBasketReminders()
    await cart.refresh()

    const stamp = cart.remindedAt
    assert.isNotNull(stamp, 'the first pass considered it')

    await notifier.sendBasketReminders()
    await cart.refresh()

    /**
     * A nightly sweep with no memory sends the same person the same email
     * every night, which is how a domain gets blocklisted — and that would
     * take the receipts down with it.
     */
    assert.equal(cart.remindedAt?.toISO(), stamp?.toISO())
  })

  test('stamps an empty basket rather than looking at it forever', async ({ assert }) => {
    const customer = await seedCustomer()
    const cart = await seedAbandonedCart(customer.id)

    await db.from('ecommerce_cart_items').where('cart_id', cart.id).delete()

    await new OrderNotifierService().sendBasketReminders()

    await cart.refresh()
    assert.isNotNull(cart.remindedAt)
  })

  test('the maintenance sweep reports how many went out', async ({ assert }) => {
    const { default: MaintenanceService } =
      await import('#modules/ecommerce/services/maintenance_service')

    const summary = await new MaintenanceService().runAll()

    // Zero on a quiet store, but present — the operator can see it ran.
    assert.property(summary, 'basketReminders')
    assert.equal(summary.basketReminders, 0)
  })
})
