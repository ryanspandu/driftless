import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Module from '#models/module'
import Page from '#models/page'
import ModulesService from '#services/modules_service'
import TemplateKitsService from '#services/template_kits_service'
import { newUlid } from '#services/ulid_service'
import { getBlockResolver } from '#services/block_data_resolvers'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { registerEcommerceBlockResolvers } from '#modules/ecommerce/services/block_resolvers'

/**
 * `shopFront()` (`/shop`) is the one storefront slot that used to do its own
 * inline page lookup instead of going through `overridePage()` — so it never
 * got the disabled-kit fallback guard the other 8 slots (cart/checkout/order/
 * account/login/register/category/tag) already have. This locks in the fix:
 * a shop front pinned to a since-deactivated kit now 404s cleanly instead of
 * rendering a broken "component not found" panel.
 */

const settings = new StoreSettingsService()
const kits = new TemplateKitsService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()

  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()

  if (!getBlockResolver('ProductDetail')) registerEcommerceBlockResolvers()
  await settings.getOrCreate()

  return cleanup
}

/** A published CODE/kit page, pointed at the "example" kit (exists on disk). */
async function kitShopFrontPage() {
  const page = await Page.create({
    id: newUlid(),
    title: 'Kit shop front',
    path: `kit-shop-front-${newUlid().slice(-6)}`,
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'CODE',
    component: 'kit:example',
    content: { root: {}, content: [] },
    seo: {},
    publishedAt: DateTime.now(),
  } as never)
  const row = await settings.getOrCreate()
  row.shopPageId = page.id
  await row.save()
  return page
}

test.group('E-commerce | shop front — kit override', (group) => {
  group.each.setup(async () => resetDatabase())

  test('renders the kit page while its kit is active', async ({ client, assert }) => {
    await kits.setActive('example', true)
    await kitShopFrontPage()

    const res = await client
      .get('/shop')
      .header('x-inertia', 'true')
      .header('x-inertia-version', '1')
    res.assertStatus(200)
    // The CODE/kit template renders, not the built-in shop front component.
    assert.equal(res.body().component, 'public/code_ssr')
  })

  test('falls back to a clean 404 (not a broken panel) once the kit is deactivated', async ({
    client,
  }) => {
    await kits.setActive('example', true)
    await kitShopFrontPage()
    await kits.setActive('example', false)

    const res = await client.get('/shop')
    res.assertStatus(404)
  })

  test('404s cleanly when the shop front is not configured at all', async ({ client }) => {
    // Deliberately no kitShopFrontPage() — store.shopPageId stays null.
    const res = await client.get('/shop')
    res.assertStatus(404)
  })

  test('search (?q=) still works through a kit shop-front override', async ({ client, assert }) => {
    await kits.setActive('example', true)
    await kitShopFrontPage()

    const res = await client
      .get('/shop?q=widget')
      .header('x-inertia', 'true')
      .header('x-inertia-version', '1')
    res.assertStatus(200)
    // record.query threads the search term to the CODE template's props.
    assert.equal((res.body().props.page.record as { query: string }).query, 'widget')
  })
})
