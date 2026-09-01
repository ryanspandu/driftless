import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Module from '#models/module'
import Page from '#models/page'
import ModulesService from '#services/modules_service'
import { newUlid } from '#services/ulid_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const settings = new StoreSettingsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()
  await settings.getOrCreate()
  return cleanup
}

/** A published builder page, optionally still a draft, that an override can point at. */
async function seedPage(path: string, title: string, status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') {
  return Page.create({
    id: newUlid(),
    title,
    path,
    status,
    renderMode: 'SSR',
    content: {
      content: [{ type: 'Heading', props: { id: 'h1', text: title, level: '1' } }],
      root: {},
    },
    seo: { title },
    publishedAt: status === 'PUBLISHED' ? DateTime.now() : null,
  })
}

/** Each storefront slot: its URL, its settings pointer, and the fixed Inertia component. */
const SLOTS = [
  { key: 'cartPageId', url: '/shop/cart', fixed: 'modules/ecommerce/storefront/cart' },
  { key: 'checkoutPageId', url: '/shop/checkout', fixed: 'modules/ecommerce/storefront/checkout' },
  { key: 'orderPageId', url: '/shop/order', fixed: 'modules/ecommerce/storefront/order' },
  {
    key: 'accountPageId',
    url: '/shop/account',
    fixed: 'modules/ecommerce/storefront/account/index',
  },
  {
    key: 'loginPageId',
    url: '/shop/account/login',
    fixed: 'modules/ecommerce/storefront/account/login',
  },
  {
    key: 'registerPageId',
    url: '/shop/account/register',
    fixed: 'modules/ecommerce/storefront/account/register',
  },
] as const

test.group('E-commerce | storefront screen overrides', (group) => {
  group.each.setup(async () => resetDatabase())

  for (const slot of SLOTS) {
    test(`${slot.url} serves the built-in screen by default`, async ({ client, assert }) => {
      const res = await client.get(slot.url).header('x-inertia', 'true')
      // The fixed Inertia screen, not a builder page.
      assert.equal(res.body().component, slot.fixed)
    })

    test(`${slot.url} serves the assigned builder page when set`, async ({ client, assert }) => {
      const page = await seedPage(`override-${slot.key}`, `Custom ${slot.key}`)
      const row = await settings.getOrCreate()
      ;(row as unknown as Record<string, unknown>)[slot.key] = page.id
      await row.save()

      const res = await client.get(slot.url).header('x-inertia', 'true')
      // A builder page carries `props.page`; the fixed screen does not.
      assert.notEqual(res.body().component, slot.fixed)
      assert.equal(res.body().props.page.title, `Custom ${slot.key}`)
    })

    test(`${slot.url} falls back to the built-in screen for a draft override`, async ({
      client,
      assert,
    }) => {
      const page = await seedPage(`draft-${slot.key}`, 'Draft', 'DRAFT')
      const row = await settings.getOrCreate()
      ;(row as unknown as Record<string, unknown>)[slot.key] = page.id
      await row.save()

      const res = await client.get(slot.url).header('x-inertia', 'true')
      // A draft would 404 as a page, so the slot serves the fixed screen instead.
      assert.equal(res.body().component, slot.fixed)
    })
  }

  test('settings persist all override page ids', async ({ assert }) => {
    const dto = await settings.update({
      cartPageId: 'p-cart',
      checkoutPageId: 'p-checkout',
      orderPageId: 'p-order',
      accountPageId: 'p-account',
      loginPageId: 'p-login',
      registerPageId: 'p-register',
    })

    assert.equal(dto.cartPageId, 'p-cart')
    assert.equal(dto.checkoutPageId, 'p-checkout')
    assert.equal(dto.orderPageId, 'p-order')
    assert.equal(dto.accountPageId, 'p-account')
    assert.equal(dto.loginPageId, 'p-login')
    assert.equal(dto.registerPageId, 'p-register')

    // A blank string clears an override back to the built-in screen.
    const cleared = await settings.update({ cartPageId: '' })
    assert.isNull(cleared.cartPageId)
  })

  test('the checkout config endpoint reports gateways and the downloads-only flag', async ({
    client,
    assert,
  }) => {
    const res = await client.get('/api/shop/checkout/config')
    res.assertStatus(200)
    assert.isArray(res.body().gateways)
    assert.isBoolean(res.body().digitalOnly)
  })
})
