/**
 * Client-side money helpers.
 *
 * Amounts cross the wire as integer **minor units** (cents), never as floats or
 * decimal strings — see `modules/ecommerce/services/money.ts` for why. This
 * module is the browser-side counterpart of that one.
 *
 * It is deliberately much smaller than the server's. The client only ever needs
 * to do two things:
 *
 *  1. turn what someone types into an integer to send back, and
 *  2. render an integer it was given.
 *
 * It must **never** compute a total, a tax, a discount or a line sum. Every
 * amount shown to a buyer is computed on the server and arrives as a `MoneyDto`
 * with a ready-made `formatted` string. Keeping arithmetic out of here is what
 * makes "the client never sends a price" enforceable rather than aspirational.
 *
 * The duplicated exponent table mirrors the repo's existing convention for the
 * client boundary (`inertia/types/api.ts` re-declares server DTOs the same way);
 * there is no shared module graph between `app/` and `inertia/`.
 */

/** ISO 4217 exponents that are not the 2-decimal default. */
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

/** An amount in the currency's smallest unit. Always an integer. */
export type Minor = number

/** The shape every server response uses to carry an amount. */
export interface MoneyDto {
  amount: Minor
  currency: string
  formatted: string
}

export function exponentOf(currency: string): number {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2
}

/**
 * Parse a typed major-unit string into minor units.
 *
 * Returns `null` for anything unparseable so callers can leave the field alone
 * while someone is mid-edit, rather than snapping it to 0.
 *
 * Parsing walks the string rather than doing `Number(x) * 100`, which is the
 * floating-point trap this whole approach exists to avoid (`19.99 * 100` is
 * `1998.9999999999998`).
 */
export function parseMajorToMinor(input: string, currency: string): Minor | null {
  const exponent = exponentOf(currency)
  const raw = input.trim().replace(/,/g, '')
  if (!/^-?\d*(\.\d*)?$/.test(raw) || raw === '' || raw === '-' || raw === '.') return null

  const negative = raw.startsWith('-')
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.')

  const padded = fraction.padEnd(exponent + 1, '0')
  const kept = padded.slice(0, exponent)
  const nextDigit = Number(padded[exponent] ?? '0')

  let minor = Number(`${whole || '0'}${kept}`)
  if (!Number.isFinite(minor)) return null
  if (nextDigit >= 5) minor += 1

  return negative ? -minor : minor
}

/** Render minor units as a bare major-unit string ("19.99"). No symbol. */
export function minorToMajorString(amount: Minor, currency: string): string {
  const exponent = exponentOf(currency)
  if (exponent === 0) return String(amount)

  const negative = amount < 0
  const digits = String(Math.abs(Math.trunc(amount))).padStart(exponent + 1, '0')
  const whole = digits.slice(0, -exponent)
  const fraction = digits.slice(-exponent)
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/**
 * Localised digits **without** a currency symbol — "6,000,000.00", or
 * "6.000.000,00" under a locale that groups that way.
 *
 * For inputs, which render the symbol as a separate prefix and would otherwise
 * show it twice. Same grouping and the same number of decimals as
 * {@link formatMoney}, so a field and the total beneath it never disagree about
 * how a number is written.
 *
 * **This is a display format, not an entry format.** Nothing parses it back —
 * see the note in `MoneyInput` about why entry stays canonical.
 */
export function formatMajor(amount: Minor, currency: string, locale?: string): string {
  const code = currency.toUpperCase()
  const exponent = exponentOf(code)
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(Number(minorToMajorString(amount, code)))
  } catch {
    return minorToMajorString(amount, code)
  }
}

/**
 * Localised display string.
 *
 * Prefer the server-provided `MoneyDto.formatted` wherever there is one; this
 * exists for values the client is holding locally (an input's live preview).
 */
export function formatMoney(amount: Minor, currency: string, locale?: string): string {
  const code = currency.toUpperCase()
  const exponent = exponentOf(code)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(Number(minorToMajorString(amount, code)))
  } catch {
    // Unknown currency code — fall back to a bare number rather than throwing
    // inside a render.
    return `${minorToMajorString(amount, code)} ${code}`
  }
}

/** The currency symbol alone, for an input prefix. */
export function currencySymbol(currency: string, locale?: string): string {
  const code = currency.toUpperCase()
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}
