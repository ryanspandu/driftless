import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import Product from '#modules/ecommerce/models/product'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import Order from '#modules/ecommerce/models/order'
import Discount from '#modules/ecommerce/models/discount'
import CheckoutService from '#modules/ecommerce/services/checkout_service'
import OrderService from '#modules/ecommerce/services/order_service'
import DiscountService from '#modules/ecommerce/services/discount_service'
import PricingService from '#modules/ecommerce/services/pricing_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import StorefrontCatalogService from '#modules/ecommerce/services/storefront_catalog_service'
import CartService from '#modules/ecommerce/services/cart_service'
import Cart from '#modules/ecommerce/models/cart'
import FakeGatewayDriver from '#modules/ecommerce/services/gateways/fake_driver'
import {
  clearGatewayOverrides,
  overrideGateway,
} from '#modules/ecommerce/services/gateways/registry'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  overrideGateway('stripe', new FakeGatewayDriver('stripe'))
  await new StoreSettingsService().getOrCreate()

  return async () => {
    clearGatewayOverrides()
    await cleanup()
  }
}

async function seedProduct(price = 10_000, stock = 50) {
  const product = await Product.create({
    id: newUlid(),
    slug: `p-${newUlid().toLowerCase().slice(-8)}`,
    title: 'Test product',
    description: '',
    type: 'physical',
    status: 'active',
    currency: 'USD',
    seo: {},
    options: [],
    featured: false,
    position: 0,
    priceFromAmount: price,
  })

  const variant = await ProductVariant.create({
    id: newUlid(),
    productId: product.id,
    title: 'Default',
    priceAmount: price,
    optionValues: {},
    stockOnHand: stock,
    stockReserved: 0,
    trackInventory: true,
    allowBackorder: false,
    position: 0,
  })

  return { product, variant }
}

async function checkout(variantId: string, quantity = 1, extra: Record<string, unknown> = {}) {
  return new CheckoutService().start({
    lines: [{ variantId, quantity }],
    email: 'buyer@example.com',
    gateway: 'stripe',
    successUrl: 'https://shop.test/thanks',
    cancelUrl: 'https://shop.test/cart',
    ...extra,
  })
}

const discounts = new DiscountService()

async function automatic(overrides: Partial<Parameters<DiscountService['create']>[0]> = {}) {
  return discounts.create({
    automatic: true,
    name: 'Summer sale',
    type: 'percent',
    value: 10,
    ...overrides,
  })
}

async function redemptionsFor(orderId: string) {
  return db.from('ecommerce_discount_redemptions').where('order_id', orderId).select('*')
}

test.group('E-commerce | automatic discounts', (group) => {
  group.each.setup(async () => resetDatabase())

  test('takes the discount off at checkout with no code', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const sale = await automatic()

    const result = await checkout(variant.id)
    const order = await Order.findOrFail(result.orderId)

    assert.equal(order.subtotalAmount, 10_000)
    assert.equal(order.discountAmount, 1_000)
    assert.equal(order.totalAmount, 9_000)
    assert.isNull(order.discountCode, 'no code was entered')

    const rows = await redemptionsFor(order.id)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0]!.discount_id, sale.id)
    assert.equal(Number(rows[0]!.amount), 1_000)
    assert.equal((await Discount.findOrFail(sale.id)).usageCount, 1)
  })

  test('a code stacks on top and the amounts are summed', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await automatic()
    await discounts.create({ code: 'SAVE10', type: 'percent', value: 10 })

    const result = await checkout(variant.id, 1, { discountCode: 'SAVE10' })
    const order = await Order.findOrFail(result.orderId)

    assert.equal(order.discountAmount, 2_000)
    assert.equal(order.totalAmount, 8_000)
    assert.equal(order.discountCode, 'SAVE10')
    assert.lengthOf(await redemptionsFor(order.id), 2, 'each discount records its own redemption')
  })

  test('two automatic discounts add up', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await automatic({ name: 'Summer', value: 10 })
    await automatic({ name: 'Loyalty', value: 5 })

    const order = await Order.findOrFail((await checkout(variant.id)).orderId)

    assert.equal(order.discountAmount, 1_500)
  })

  test('stacked discounts never take an item below zero', async ({ assert }) => {
    const { variant } = await seedProduct(1_000)
    await automatic({ name: 'Big', type: 'fixed', value: 800 })
    await automatic({ name: 'Bigger', type: 'fixed', value: 800 })

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])
    const applied = await discounts.evaluateBasket(priced, { email: null, baseCurrency: 'USD' })

    assert.equal(applied.amount, 1_000, 'capped at the unit price')
  })

  test('a fixed amount comes off every unit', async ({ assert }) => {
    const { variant } = await seedProduct(2_000)
    await automatic({ type: 'fixed', value: 500 })

    const order = await Order.findOrFail((await checkout(variant.id, 3)).orderId)

    assert.equal(order.subtotalAmount, 6_000)
    assert.equal(order.discountAmount, 1_500)
  })

  test('can be switched off for one product only', async ({ assert }) => {
    const first = await seedProduct(10_000)
    const second = await seedProduct(10_000)
    const sale = await automatic()

    await discounts.setForProduct(first.product.id, sale.id, false)

    const withoutIt = await Order.findOrFail((await checkout(first.variant.id)).orderId)
    const withIt = await Order.findOrFail((await checkout(second.variant.id)).orderId)

    assert.equal(withoutIt.discountAmount, 0)
    assert.equal(withIt.discountAmount, 1_000, 'other products keep the discount')

    const listed = await discounts.forProduct(first.product.id)
    assert.deepEqual(
      listed.map((d) => ({ id: d.id, applies: d.applies })),
      [{ id: sale.id, applies: false }]
    )

    await discounts.setForProduct(first.product.id, sale.id, true)
    assert.isTrue((await discounts.forProduct(first.product.id))[0]!.applies)
  })

  test('the storefront shows the discounted price and the old one struck through', async ({
    assert,
  }) => {
    const { product } = await seedProduct(10_000)
    await automatic()

    const dto = await new StorefrontCatalogService().findBySlug(product.slug)

    assert.equal(dto.variants[0]!.price.amount, 9_000)
    assert.equal(dto.variants[0]!.compareAt?.amount, 10_000)
    assert.equal(dto.priceFrom?.amount, 9_000)
  })

  test('the price on the page is the price at checkout', async ({ assert }) => {
    const { product, variant } = await seedProduct(3_333)
    await automatic({ value: 12.5 })

    const dto = await new StorefrontCatalogService().findBySlug(product.slug)
    const shown = dto.variants[0]!.price.amount

    const order = await Order.findOrFail((await checkout(variant.id, 7)).orderId)

    assert.equal(order.totalAmount, shown * 7, 'no rounding drift between page and basket')
  })

  test('a product switched off shows its normal price', async ({ assert }) => {
    const { product } = await seedProduct(10_000)
    const sale = await automatic()
    await discounts.setForProduct(product.id, sale.id, false)

    const dto = await new StorefrontCatalogService().findBySlug(product.slug)

    assert.equal(dto.variants[0]!.price.amount, 10_000)
    assert.isNull(dto.variants[0]!.compareAt)
  })

  test('keeps a higher compare-at the shop set itself', async ({ assert }) => {
    const { product, variant } = await seedProduct(10_000)
    await ProductVariant.query().where('id', variant.id).update({ compare_at_amount: 15_000 })
    await automatic()

    const dto = await new StorefrontCatalogService().findBySlug(product.slug)

    assert.equal(dto.variants[0]!.price.amount, 9_000)
    assert.equal(dto.variants[0]!.compareAt?.amount, 15_000)
  })

  test('is not applied before it starts, after it ends, or when disabled', async ({ assert }) => {
    const { product } = await seedProduct(10_000)
    await automatic({ name: 'Future', startsAt: DateTime.now().plus({ days: 2 }).toISO() })
    await automatic({ name: 'Past', endsAt: DateTime.now().minus({ days: 2 }).toISO() })
    await automatic({ name: 'Off', enabled: false })

    const dto = await new StorefrontCatalogService().findBySlug(product.slug)

    assert.equal(dto.variants[0]!.price.amount, 10_000)
  })

  test('its internal code cannot be typed in as a coupon', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const sale = await automatic()
    assert.match(sale.code, /^AUTO-/)

    const priced = await new PricingService().price([{ variantId: variant.id, quantity: 1 }])
    await assert.rejects(() => discounts.validate(sale.code, priced, null), /not valid/i)
  })

  test('needs a name, and cannot be free shipping', async ({ assert }) => {
    await assert.rejects(
      () => discounts.create({ automatic: true, type: 'percent', value: 10 }),
      /name/i
    )
    await assert.rejects(
      () => discounts.create({ automatic: true, name: 'Ship', type: 'free_shipping', value: 0 }),
      /free shipping/i
    )
  })

  test('drops the conditions that only make sense for a typed code', async ({ assert }) => {
    const sale = await automatic({
      minSubtotalAmount: 5_000,
      maxDiscountAmount: 100,
      usageLimitPerCustomer: 1,
    })

    assert.isNull(sale.minSubtotalAmount)
    assert.isNull(sale.maxDiscountAmount)
    assert.isNull(sale.usageLimitPerCustomer)
  })

  test('the basket shows the automatic discount and the code together', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    await automatic()
    await discounts.create({ code: 'SAVE10', type: 'percent', value: 10 })

    const cart = await Cart.create({
      id: newUlid(),
      tokenHash: newUlid(),
      currency: 'USD',
      discountCode: 'SAVE10',
      expiresAt: DateTime.now().plus({ days: 7 }),
    })
    const carts = new CartService()
    await carts.addItem(cart, variant.id, 1)

    const dto = await carts.toDto(cart)

    assert.equal(dto.discount.amount, 2_000)
    assert.equal(dto.total.amount, 8_000)
    assert.equal(dto.discountCode, 'SAVE10')
    assert.deepEqual(
      dto.automaticDiscounts.map((d) => ({ name: d.name, amount: d.amount.amount })),
      [{ name: 'Summer sale', amount: 1_000 }]
    )
  })

  test('an expired abandoned checkout gives back every use it held', async ({ assert }) => {
    const { variant } = await seedProduct(10_000)
    const sale = await automatic({ usageLimit: 5 })
    const code = await discounts.create({ code: 'SAVE10', type: 'percent', value: 10 })

    const result = await checkout(variant.id, 1, { discountCode: 'SAVE10' })
    assert.equal((await Discount.findOrFail(sale.id)).usageCount, 1)
    assert.equal((await Discount.findOrFail(code.id)).usageCount, 1)

    await Order.query()
      .where('id', result.orderId)
      .update({ reservation_expires_at: DateTime.now().minus({ hours: 1 }).toSQL() })
    await new OrderService().expireStaleOrders()

    assert.equal((await Discount.findOrFail(sale.id)).usageCount, 0)
    assert.equal((await Discount.findOrFail(code.id)).usageCount, 0)
  })
})
