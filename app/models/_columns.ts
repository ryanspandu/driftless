/**
 * Shared Lucid column decorators for types whose representation differs between
 * PostgreSQL (production) and SQLite (the test suite).
 *
 * Without these, the same model returns different JavaScript types depending on
 * which driver is underneath — the sort of difference that makes a test pass
 * and production fail, or vice versa.
 */

/**
 * Boolean that is actually a boolean on both drivers.
 *
 * SQLite has no boolean type and returns `0` / `1`; node-postgres returns
 * `true` / `false`. Existing code works around this with scattered
 * `Boolean(row.enabled)` calls at every read site, which is easy to forget —
 * and `if (row.enabled)` on a SQLite `0` is falsy, so the bug hides until a
 * value is compared with `===` or serialised into JSON.
 */
export const booleanColumn = {
  prepare: (value: unknown) => (value ? 1 : 0),
  consume: (value: unknown) => {
    if (value === null || value === undefined) return value as null | undefined
    return Boolean(value)
  },
}

/**
 * Nullable boolean — keeps `null` distinct from `false`.
 *
 * Needed wherever "not known yet" and "no" are different answers, e.g. whether
 * a test send has ever succeeded.
 */
export const nullableBooleanColumn = {
  prepare: (value: unknown) => (value === null || value === undefined ? null : value ? 1 : 0),
  consume: (value: unknown) => (value === null || value === undefined ? null : Boolean(value)),
}

/**
 * JSON / JSONB column.
 *
 * pg returns `jsonb` already parsed; SQLite returns the raw string. Mirrors the
 * inline helper that `app/models/page.ts` and friends already define.
 */
export const jsonColumn = {
  prepare: (value: unknown) => JSON.stringify(value ?? {}),
  consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : (value ?? {})),
}

/**
 * `BIGINT` holding money in minor units.
 *
 * node-postgres returns `bigint` as a **string** to avoid precision loss.
 * Amounts in this codebase are bounded well inside `Number.MAX_SAFE_INTEGER`
 * (that is 90 trillion dollars in cents), so converting to a number is safe and
 * keeps arithmetic ordinary — see `modules/ecommerce/services/money.ts`.
 */
export const moneyColumn = {
  prepare: (value: unknown) => value,
  consume: (value: unknown) => {
    if (value === null || value === undefined) return null
    const parsed = typeof value === 'string' ? Number(value) : (value as number)
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`Money column value is not a safe integer: ${String(value)}`)
    }
    return parsed
  },
}
