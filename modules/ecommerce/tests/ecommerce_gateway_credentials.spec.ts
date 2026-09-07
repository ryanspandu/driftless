import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import GatewayCredentialsService from '#modules/ecommerce/services/gateway_credentials_service'

/**
 * Money-safety invariants for gateway credentials: only one mode per gateway may
 * be enabled (so a test key can never settle a live payment, or vice versa), and
 * Lemon Squeezy — which can only settle via its webhook — cannot be enabled
 * without a webhook signing secret.
 */

const svc = new GatewayCredentialsService()

test.group('Gateway credentials | mode isolation', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    return cleanup
  })

  test('enabling one mode disables the sibling mode', async ({ assert }) => {
    await svc.update('stripe', 'test', { secretKey: 'sk_test_x', enabled: true })
    await svc.update('stripe', 'live', { secretKey: 'sk_live_x', enabled: true })

    const list = await svc.list()
    const test = list.find((c) => c.gateway === 'stripe' && c.mode === 'test')
    const live = list.find((c) => c.gateway === 'stripe' && c.mode === 'live')

    assert.isFalse(test?.enabled, 'test mode should be disabled after live is enabled')
    assert.isTrue(live?.enabled)
  })

  test('resolve() returns the single enabled mode', async ({ assert }) => {
    await svc.update('stripe', 'test', { secretKey: 'sk_test_x' })
    await svc.update('stripe', 'live', { secretKey: 'sk_live_x', enabled: true })

    const resolved = await svc.resolve('stripe')
    assert.equal(resolved.mode, 'live')
    assert.equal(resolved.secretKey, 'sk_live_x')
  })
})

test.group('Gateway credentials | Lemon Squeezy enable guard', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    return cleanup
  })

  test('refuses to enable Lemon Squeezy without a webhook signing secret', async ({ assert }) => {
    let caught: unknown
    try {
      await svc.update('lemonsqueezy', 'test', {
        secretKey: 'ls_api_key',
        config: { storeId: '1', variantId: '2' },
        enabled: true,
      })
    } catch (e) {
      caught = e
    }
    assert.instanceOf(caught, Error)

    // And it did not slip through as enabled.
    const row = (await svc.list()).find((c) => c.gateway === 'lemonsqueezy' && c.mode === 'test')
    assert.isNotTrue(row?.enabled)
  })

  test('enables Lemon Squeezy once a webhook secret is present', async ({ assert }) => {
    const dto = await svc.update('lemonsqueezy', 'test', {
      secretKey: 'ls_api_key',
      webhookSecret: 'ls_whsec',
      config: { storeId: '1', variantId: '2' },
      enabled: true,
    })
    assert.isTrue(dto.enabled)
    assert.equal(dto.config.storeId, '1')
    assert.equal(dto.config.variantId, '2')
  })
})
