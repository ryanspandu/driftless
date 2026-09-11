/**
 * Money arithmetic for the e-commerce module.
 *
 * ## Why integers
 *
 * Every amount in this module is a **`Minor`**: an integer count of the
 * currency's smallest unit (cents for USD, sen for IDR when configured with two
 * decimals, yen for JPY which has none). Nothing here ever holds a float.
 *
 * The alternatives were both worse in this codebase:
 *
 *  - `DOUBLE PRECISION` — what the CMS `DECIMAL` field type actually maps to.
 *    `0.1 + 0.2 !== 0.3`, so order totals drift. Never model money this way.
 *  - `NUMERIC(12,2)` — correct in the database, but node-postgres returns it as
 *    a **string** (there is no `pg.types.setTypeParser` override in this repo),
 *    while SQLite (used by the test suite) has no real NUMERIC at all. That
 *    means two different runtime types for the same column depending on the
 *    driver, and every DTO and React component would have to cope.
 *
 * A `BIGINT` of minor units is exact, has one runtime type everywhere, and
 * survives the pg/SQLite split unchanged.
 *
 * ## Where rounding happens
 *
 * Only in {@link applyPercent} and {@link allocate}. Every other operation is
 * exact integer arithmetic. Keeping rounding in two audited places is what
 * makes totals reproducible — a discount applied twice in different orders must
 * not produce different results.
 */

/** An exact amount, counted in the currency's smallest unit. Always an integer. */
export type Minor = number

/**
 * Number of decimal places for currencies that are not the 2-decimal default.
 *
 * ISO 4217 exponents. Only the exceptions are listed; anything absent is
 * assumed to have 2, which covers the large majority of currencies.
 */
const CURRENCY_EXPONENT: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

/** Thrown when an amount or currency is not usable. Never surfaced verbatim. */
export class MoneyError extends Error {}

function assertInteger(value: number, label: string): asserts value is Minor {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer amount of minor units, got ${value}`)
  }
}

/** Decimal places used by `currency`. */
export function exponentOf(currency: string): number {
  const code = currency.toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new MoneyError(`Invalid ISO 4217 currency code: ${currency}`)
  }
  return CURRENCY_EXPONENT[code] ?? 2
}

/**
 * Parse a human-entered major-unit amount ("19.99") into minor units (1999).
 *
 * Parsing goes through the string form rather than `Number(x) * 100`, because
 * the latter is exactly the floating-point trap this module exists to avoid:
 * `19.99 * 100` is `1998.9999999999998`.
 */
export function fromMajor(value: string | number, currency: string): Minor {
  const exponent = exponentOf(currency)
  const raw = typeof value === 'number' ? value.toFixed(exponent) : value.trim()

  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new MoneyError(`Not a valid amount: ${value}`)
  }

  const negative = raw.startsWith('-')
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.')

  // Pad or round the fraction to the currency's exponent.
  const padded = fraction.padEnd(exponent + 1, '0')
  const kept = padded.slice(0, exponent)
  const nextDigit = Number(padded[exponent] ?? '0')

  let minor = Number(`${whole}${kept}` || '0')
  if (nextDigit >= 5) minor += 1 // half-up on the discarded remainder

  assertInteger(minor, 'amount')
  return negative ? -minor : minor
}

/** Render minor units as a plain major-unit string ("19.99"). No symbol. */
export function toMajor(amount: Minor, currency: string): string {
  assertInteger(amount, 'amount')
  const exponent = exponentOf(currency)
  if (exponent === 0) return String(amount)

  const negative = amount < 0
  const digits = String(Math.abs(amount)).padStart(exponent + 1, '0')
  const whole = digits.slice(0, -exponent)
  const fraction = digits.slice(-exponent)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/**
 * Localised display string ("$19.99").
 *
 * Formatting is a presentation concern, but it lives here so the server can put
 * a ready-to-render string in every DTO. The client must never do money
 * arithmetic — it receives the amount, the currency and the formatted string.
 */
export function format(amount: Minor, currency: string, locale = 'en-US'): string {
  const exponent = exponentOf(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(Number(toMajor(amount, currency)))
}

/** Exact sum. */
export function sum(...amounts: Minor[]): Minor {
  let total = 0
  for (const amount of amounts) {
    assertInteger(amount, 'amount')
    total += amount
  }
  assertInteger(total, 'total')
  return total
}

/** `amount * quantity`, exact. */
export function multiply(amount: Minor, quantity: number): Minor {
  assertInteger(amount, 'amount')
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, got ${quantity}`)
  }
  const result = amount * quantity
  assertInteger(result, 'product')
  return result
}

/**
 * A percentage of an amount, rounded half-up away from zero.
 *
 * Half-up matches what people expect when they check an invoice by hand, and
 * matches what Stripe and PayPal do for their own line items — a different
 * mode here would make our totals disagree with the gateway's.
 */
export function applyPercent(amount: Minor, percent: number): Minor {
  assertInteger(amount, 'amount')
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`Percent must be finite, got ${percent}`)
  }

  // Scale by 10_000 so a 2-decimal percentage (e.g. 8.25%) stays integral
  // through the multiplication, then round once at the end.
  const scaled = Math.round(percent * 10_000)
  const product = amount * scaled
  const rounded = Math.trunc(product / 1_000_000)
  const remainder = Math.abs(product % 1_000_000)

  const bump = remainder * 2 >= 1_000_000 ? Math.sign(product) : 0
  const result = rounded + bump
  assertInteger(result, 'result')
  return result
}

/**
 * Split `amount` across `ratios` with no cent lost or invented.
 *
 * Needed wherever a total has to be attributed back to the lines that produced
 * it — an order-level discount spread over items, tax broken out per line, a
 * partial refund distributed proportionally. Naive rounding of each share
 * independently leaves a remainder that makes the parts disagree with the
 * whole; here the leftover minor units are handed out one at a time, largest
 * fractional part first, so `sum(allocate(x, r)) === x` always holds.
 */
export function allocate(amount: Minor, ratios: number[]): Minor[] {
  assertInteger(amount, 'amount')
  if (ratios.length === 0) {
    throw new MoneyError('Cannot allocate across zero ratios')
  }
  if (ratios.some((r) => !Number.isFinite(r) || r < 0)) {
    throw new MoneyError('Allocation ratios must be finite and non-negative')
  }

  const total = ratios.reduce((acc, r) => acc + r, 0)
  if (total <= 0) {
    // Nothing to weight by: give everything to the first slot rather than
    // silently returning zeros that no longer sum to `amount`.
    return ratios.map((_, index) => (index === 0 ? amount : 0))
  }

  const exact = ratios.map((ratio) => (amount * ratio) / total)
  const floors = exact.map((value) => Math.floor(value))
  let remainder = amount - floors.reduce((acc, value) => acc + value, 0)

  // Hand the remaining units to the largest fractional parts, so the result is
  // deterministic for a given input rather than dependent on iteration order.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  const result = [...floors]
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index] = result[index]! + 1
    remainder -= 1
  }

  return result
}

/** Clamp to a floor of zero — a discount must never make a line negative. */
export function atLeastZero(amount: Minor): Minor {
  assertInteger(amount, 'amount')
  return amount < 0 ? 0 : amount
}

/** The wire shape for any amount leaving the server. */
export interface MoneyDto {
  /** Minor units. The only field arithmetic may be done on. */
  amount: Minor
  /** ISO 4217, uppercase. */
  currency: string
  /** Localised display string, precomputed so clients never format money. */
  formatted: string
}

/** Build the DTO shape used by every API response that carries an amount. */
export function toDto(amount: Minor, currency: string, locale?: string): MoneyDto {
  const code = currency.toUpperCase()
  return { amount, currency: code, formatted: format(amount, code, locale) }
}

export const Money = {
  fromMajor,
  toMajor,
  format,
  sum,
  multiply,
  applyPercent,
  allocate,
  atLeastZero,
  exponentOf,
  toDto,
}

export default Money
