import type { HttpContext } from '@adonisjs/core/http'
import PublicError from '#exceptions/public_error'

/** One field-level validation failure, as VineJS reports it. */
interface VineMessage {
  field?: string
  rule?: string
  message?: string
}

function isValidationError(error: unknown): error is { code: string; messages: VineMessage[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'E_VALIDATION_ERROR'
  )
}

/**
 * Turn a caught error into a JSON API response.
 *
 * Why this exists rather than letting the framework handle it: Adonis's
 * exception handler content-negotiates on the `Accept` header, and a request
 * that does not clearly ask for JSON gets the HTML/redirect path instead — a
 * validation failure on an XHR then comes back as an empty 200, which the
 * client reads as success. For endpoints that only ever speak JSON, an explicit
 * contract is worth more than automatic negotiation.
 *
 * The three outcomes:
 *
 *  - **Validation error** → 422 with `errors[]` plus a `message` summarising the
 *    first failure, because the shared client helper (`apiErrorMessage`) reads
 *    `message`.
 *  - **`PublicError`** → its own status and message; these are written to be
 *    read by a user.
 *  - **Anything else** → a generic 500. The real error is logged, never echoed:
 *    service and driver messages leak table names and constraint identifiers.
 */
export function apiFail(response: HttpContext['response'], error: unknown, scope: string) {
  if (isValidationError(error)) {
    const errors = (error.messages ?? []).map((m) => ({
      field: m.field ?? null,
      rule: m.rule ?? null,
      message: m.message ?? 'Invalid value',
    }))

    return response.status(422).json({
      message: errors[0]?.message ?? 'Validation failed.',
      reason: 'validation_failed',
      errors,
    })
  }

  const { status, body } = PublicError.toResponse(error)
  if (!PublicError.is(error)) console.error(`[${scope}]`, error)
  return response.status(status).json(body)
}
