import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { IntegrationSettingsService } from '#services/settings_service'

/**
 * The storefront CAPTCHA gate. The shared `CaptchaService` is fail-closed: a
 * missing token verifies as false without any call to the provider, so the
 * "required but no token → rejected" path is fully testable here. The
 * "valid token passes" path would call the provider's siteverify and is left to
 * manual/integration testing.
 */
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

const integrations = () => new IntegrationSettingsService()

/** Turn CAPTCHA on for the given flows with an invisible-capable provider. */
async function enableCaptcha(
  flags: { onLogin?: boolean; onRegister?: boolean; onCheckout?: boolean },
  provider: 'turnstile' | 'hcaptcha' = 'turnstile'
) {
  await integrations().update({
    captchaEnabled: true,
    captchaProvider: provider,
    captchaSiteKey: 'test-site-key',
    captchaSecret: 'test-secret-key',
    captchaOnLogin: flags.onLogin ?? false,
    captchaOnRegister: flags.onRegister ?? false,
    captchaOnCheckout: flags.onCheckout ?? false,
  })
}

test.group('E-commerce | storefront CAPTCHA', (group) => {
  group.each.setup(async () => resetDatabase())

  test('login without a token is rejected when CAPTCHA is required', async ({ client, assert }) => {
    await enableCaptcha({ onLogin: true })

    const res = await client
      .post('/api/shop/account/login')
      .json({ email: 'someone@example.com', password: 'whatever-password' })

    res.assertStatus(400)
    assert.equal(res.body().reason, 'captcha_failed')
  })

  test('register without a token is rejected when CAPTCHA is required', async ({
    client,
    assert,
  }) => {
    await enableCaptcha({ onRegister: true })

    const res = await client
      .post('/api/shop/account/register')
      .json({ email: 'new@example.com', password: 'a-good-password' })

    res.assertStatus(400)
    assert.equal(res.body().reason, 'captcha_failed')
  })

  test('login is untouched when CAPTCHA is disabled', async ({ client, assert }) => {
    // No enableCaptcha() call — default row has captcha off.
    const res = await client
      .post('/api/shop/account/login')
      .json({ email: 'nobody@example.com', password: 'wrong-password' })

    // It reaches credential verification instead of the CAPTCHA gate: a wrong
    // login is the generic 401, never a captcha rejection.
    res.assertStatus(401)
    assert.notEqual(res.body().reason, 'captcha_failed')
  })

  test('checkout without a token is rejected for an invisible provider', async ({
    client,
    assert,
  }) => {
    await enableCaptcha({ onCheckout: true }, 'turnstile')

    // The gate runs before the cart is even read, so no basket setup is needed.
    const res = await client
      .post('/api/shop/checkout')
      .header('Idempotency-Key', 'test-key-000')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    res.assertStatus(400)
    assert.equal(res.body().reason, 'captcha_failed')
  })

  test('checkout is NOT gated for a non-invisible provider (falls back to rate limit)', async ({
    client,
    assert,
  }) => {
    // hCaptcha is interactive, so checkout must not challenge — even with the
    // toggle on. The request proceeds past the CAPTCHA gate to normal handling.
    await enableCaptcha({ onCheckout: true }, 'hcaptcha')

    const res = await client
      .post('/api/shop/checkout')
      .header('Idempotency-Key', 'test-key-001')
      .json({ email: 'buyer@example.com', gateway: 'stripe' })

    // Whatever the outcome (an empty basket 422, etc.), it must not be a
    // captcha rejection — that would mean an interactive puzzle on the buy path.
    assert.notEqual(res.body().reason, 'captcha_failed')
  })
})
