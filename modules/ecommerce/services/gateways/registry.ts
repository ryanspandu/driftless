import type { GatewayName } from '#modules/ecommerce/models/gateway_credential'
import GatewayCredentialsService from '#modules/ecommerce/services/gateway_credentials_service'
import StripeDriver from '#modules/ecommerce/services/gateways/stripe_driver'
import PayPalDriver from '#modules/ecommerce/services/gateways/paypal_driver'
import type { PaymentGatewayDriver } from '#modules/ecommerce/services/gateways/types'

const credentials = new GatewayCredentialsService()

/**
 * Test-only override.
 *
 * The alternative — letting the suite talk to Stripe and PayPal — would make
 * tests slow, flaky, and dependent on someone's sandbox account still existing.
 * Registering a fake here keeps every layer above the driver under test with
 * real code paths.
 */
const overrides = new Map<GatewayName, PaymentGatewayDriver>()

export function overrideGateway(name: GatewayName, driver: PaymentGatewayDriver): void {
  overrides.set(name, driver)
}

export function clearGatewayOverrides(): void {
  overrides.clear()
}

/**
 * Build the driver for a gateway from its stored credentials.
 *
 * A fresh instance per call rather than a cached one: credentials can be
 * rotated from the admin UI at any moment, and a long-lived client holding a
 * revoked key would keep failing until the process restarted.
 */
export async function gatewayDriver(name: GatewayName): Promise<PaymentGatewayDriver> {
  const override = overrides.get(name)
  if (override) return override

  const resolved = await credentials.resolve(name)

  switch (name) {
    case 'stripe':
      return new StripeDriver(resolved)
    case 'paypal':
      return new PayPalDriver(resolved)
    default: {
      // Exhaustiveness guard: adding a gateway to the union without adding it
      // here becomes a compile error rather than a runtime surprise.
      const unreachable: never = name
      throw new Error(`Unknown payment gateway: ${String(unreachable)}`)
    }
  }
}
