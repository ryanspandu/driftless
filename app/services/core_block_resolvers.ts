import { registerBlockResolver } from '#services/block_data_resolvers'
import { IntegrationSettingsService } from '#services/settings_service'

const integrationService = new IntegrationSettingsService()

/**
 * The one key every auth block looks its config up under.
 *
 * Shared rather than per-block because the payload is per-request, not
 * per-block: whether Google sign-in is on does not depend on which form asked.
 * The walker deduplicates by key, so a page holding a login form and a sign-up
 * link still costs exactly one lookup.
 */
export const AUTH_CONFIG_KEY = 'auth:config'

/**
 * Block types that render an auth form and therefore need the public auth
 * config server-side.
 *
 * `FormBlock` is included because its `handler` field turns a hand-assembled
 * form into a real login or sign-up form, and such a form needs the same
 * CAPTCHA decision the turnkey blocks make.
 */
const AUTH_BLOCK_TYPES = [
  'LoginForm',
  'RegisterForm',
  'ForgotPasswordForm',
  'ResetPasswordForm',
  'FormBlock',
] as const

/**
 * Core's own server-side block data.
 *
 * Registered from a provider rather than at import time for the same reason
 * modules are: `registerBlockResolver` throws on a duplicate type, so it must
 * run exactly once, at boot, in a container that is already up.
 *
 * Without this the auth blocks would still work — they fall back to fetching
 * `/api/auth/config` on the client — but a server-rendered login page would
 * paint without its Google button and CAPTCHA and then pop them in, which on a
 * credential screen reads as the page not being finished loading.
 */
export function registerCoreBlockResolvers(): void {
  for (const type of AUTH_BLOCK_TYPES) {
    registerBlockResolver(type, {
      collect(props) {
        /**
         * A plain Form Block with no handler is not an auth form and needs
         * nothing. Every other type always does.
         */
        if (type === 'FormBlock') {
          const handler = String(props.handler ?? 'none')
          if (!handler || handler === 'none') return null
        }
        return { key: AUTH_CONFIG_KEY }
      },

      async resolve() {
        return { [AUTH_CONFIG_KEY]: await integrationService.getAuthPublicConfig() }
      },
    })
  }
}
