import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { browserClient } from '@japa/browser-client'
import { authBrowserClient } from '@adonisjs/auth/plugins/browser_client'
import { sessionBrowserClient } from '@adonisjs/session/plugins/browser_client'
import { authApiClient } from '@adonisjs/auth/plugins/api_client'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import { shieldApiClient } from '@adonisjs/shield/plugins/api_client'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 */
export const plugins: Config['plugins'] = [
  assert(),
  apiClient({
    baseURL: `http://${process.env.HOST ?? 'localhost'}:${process.env.PORT ?? '3333'}`,
  }),
  pluginAdonisJS(app),
  dbAssertions(app),
  authApiClient(app),
  sessionApiClient(app),
  shieldApiClient(),
  browserClient({ runInSuites: ['browser'] }),
  sessionBrowserClient(app),
  authBrowserClient(app),
]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 *
 * The setup functions are executed before all the tests
 * The teardown functions are executed after all the tests
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [],
  teardown: [],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  /**
   * `modules` is here because a module's tests live with the module and are
   * functional in nature — they boot the app and make HTTP requests. Leaving it
   * out starts no server, and every request fails as a bare connection error
   * that says nothing about the real cause.
   */
  if (['browser', 'functional', 'e2e', 'modules', 'pg'].includes(suite.name)) {
    suite.setup(() => testUtils.httpServer().start())

    /**
     * Rate limits are per-minute and every test shares one IP, so without this
     * the *density* of the suite decides whether it passes: pack enough
     * checkout requests into a minute and a later test gets a 429 where it
     * expected a 404. Clearing between tests keeps a limit a property of the
     * test that exercises it rather than of whatever ran just before.
     *
     * Safe because the store is in-memory in tests (`LIMITER_STORE=memory` in
     * `.env.test`) — this clears the suite's own counters, never a real Redis.
     */
    const clearLimits = async () => {
      const { default: limiter } = await import('@adonisjs/limiter/services/main')
      await limiter.clear(['memory'])
    }

    // Both, because `onTest` only sees tests registered straight on the suite —
    // anything inside a `test.group(...)` arrives through `onGroup`, and nearly
    // every test here is in a group.
    suite.onTest((test) => test.setup(clearLimits))
    suite.onGroup((group) => group.each.setup(clearLimits))
  }
}
