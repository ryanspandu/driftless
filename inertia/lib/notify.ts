import { toast } from 'sonner'
import { apiErrorMessage } from '~/lib/api'

/**
 * One way to tell the user how an action went.
 *
 * Success: a past-tense, sentence-case toast with no full stop — "User created",
 * "3 discounts deleted". Failure: the server's own message where it gave one
 * (`apiErrorMessage`), otherwise a "Failed to …" fallback.
 *
 * `QueryProvider` calls `reportError` for every failed mutation, so a call site
 * only needs to `reportError` itself for work that does *not* go through
 * react-query (raw `api.post`, `fetch`, `router.*`, offline-store writes).
 */

/**
 * Errors already shown, so the same failure is never toasted twice — e.g. by the
 * global mutation handler *and* a `catch` further up that also wants to tell the
 * user. Keyed on the error object itself; primitives cannot be tracked and are
 * simply toasted each time.
 */
const reported = new WeakSet<object>()

export function reportError(err: unknown, fallback = 'Something went wrong'): void {
  if (typeof err === 'object' && err !== null) {
    if (reported.has(err)) return
    reported.add(err)
  }
  toast.error(apiErrorMessage(err, fallback))
}

export function reportSuccess(message: string): void {
  toast.success(message)
}
