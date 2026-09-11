import { test } from '@japa/runner'
/**
 * Loaded for its module augmentation only — it is what puts `assert` on the
 * test context. `tests/bootstrap.ts` pulls it in for the server-side suites,
 * and that file is deliberately outside this TypeScript project.
 */
import '@japa/assert'
/**
 * Relative, not `~/lib/api`. That alias exists only in `vite.config.ts` and
 * `tsconfig.inertia.json` — Node's resolver knows nothing about it, so a spec
 * using it fails to import and the test runner hangs rather than reporting.
 */
import { isServerUnreachable, toApiError } from './api.js'

/**
 * The one distinction that keeps a successful install from looking like a
 * crash.
 *
 * An install ends by restarting the server, so the poller *will* fail for a few
 * seconds. Reading that as an error shows a red failure at the exact moment
 * everything worked. These three cases are the whole discriminator.
 */

/** A rejection with no response at all — connection refused, or a timeout. */
function noResponseRejection(message: string) {
  return { message }
}

test.group('isServerUnreachable', () => {
  test('a rejection with no response is unreachable', ({ assert }) => {
    const err = toApiError(noResponseRejection('Network Error'))

    assert.equal(err.status, 500)
    assert.isUndefined(err.body)
    assert.isTrue(isServerUnreachable(err))
  })

  test('an axios timeout is unreachable', ({ assert }) => {
    /**
     * Under socket activation the kernel queues the connection while the app is
     * down, so a poll *hangs* instead of failing. The timeout is what turns that
     * into a signal — and it has to land in the same bucket as a refused
     * connection, or the two deployment shapes would need different UI.
     */
    const err = toApiError(noResponseRejection('timeout of 8000ms exceeded'))

    assert.isTrue(isServerUnreachable(err))
  })

  test('a real 500 from the API is not unreachable', ({ assert }) => {
    /**
     * Every JSON endpoint answers through `PublicError.toResponse`, so a
     * genuine 500 always carries a body. That is what makes an *absent* body a
     * reliable signal rather than a guess.
     */
    const err = toApiError({
      response: { status: 500, data: { message: 'Something broke', error: undefined } },
    })

    assert.equal(err.status, 500)
    assert.isDefined(err.body)
    assert.isFalse(isServerUnreachable(err))
  })

  test('a 409 is not unreachable', ({ assert }) => {
    const err = toApiError({
      response: { status: 409, data: { message: 'An install is already running.' } },
    })

    assert.isFalse(isServerUnreachable(err))
  })

  test('a non-ApiError is not unreachable', ({ assert }) => {
    assert.isFalse(isServerUnreachable(new Error('boom')))
  })
})
