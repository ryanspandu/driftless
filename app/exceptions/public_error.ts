import { Exception } from '@adonisjs/core/exceptions'

/**
 * An error whose message is safe to show to a client.
 *
 * The prevailing idiom across older controllers is:
 *
 * ```ts
 * catch (e) { return response.status(422).json({ message: (e as Error).message }) }
 * ```
 *
 * which echoes whatever the service (or the database driver) threw — leaking
 * internal wording, table names and constraint identifiers. Anything handling
 * money must not do that.
 *
 * The rule for new code: services throw `PublicError` for conditions the caller
 * is allowed to know about, and plain `Error` for everything else. Controllers
 * catch `PublicError` and echo it; every other error becomes a generic 500 and
 * is left to the exception handler to report.
 */
export default class PublicError extends Exception {
  static status = 422
  static code = 'E_PUBLIC_ERROR'

  /**
   * A stable machine-readable identifier for this failure (e.g.
   * `out_of_stock`, `discount_expired`). Clients should branch on this rather
   * than on the human-readable message, which may be reworded at any time.
   */
  declare readonly reason: string

  constructor(message: string, options: { status?: number; reason?: string } = {}) {
    super(message, { status: options.status ?? PublicError.status, code: PublicError.code })
    this.reason = options.reason ?? 'error'
  }

  /** True when `error` is safe to relay verbatim to a client. */
  static is(error: unknown): error is PublicError {
    return error instanceof PublicError
  }

  /**
   * Narrow an unknown caught value into a client-safe `{ status, body }` pair.
   * Non-public errors collapse to a generic 500 so nothing internal escapes.
   */
  static toResponse(error: unknown): {
    status: number
    body: { message: string; reason: string }
  } {
    if (PublicError.is(error)) {
      return { status: error.status, body: { message: error.message, reason: error.reason } }
    }
    return {
      status: 500,
      body: { message: 'Something went wrong. Please try again.', reason: 'internal_error' },
    }
  }
}

/** Convenience factories for the statuses used most often. */
export const publicError = {
  badRequest: (message: string, reason?: string) =>
    new PublicError(message, { status: 400, reason }),
  forbidden: (message: string, reason?: string) =>
    new PublicError(message, { status: 403, reason }),
  notFound: (message: string, reason?: string) => new PublicError(message, { status: 404, reason }),
  conflict: (message: string, reason?: string) => new PublicError(message, { status: 409, reason }),
  unprocessable: (message: string, reason?: string) =>
    new PublicError(message, { status: 422, reason }),
  unavailable: (message: string, reason?: string) =>
    new PublicError(message, { status: 503, reason }),
}
