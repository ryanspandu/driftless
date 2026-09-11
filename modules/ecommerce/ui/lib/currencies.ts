/**
 * Currency codes for the admin's picker.
 *
 * A copy of `modules/ecommerce/services/currency_codes.ts`, following the same
 * client-boundary convention as the money helpers: `inertia/` has no path into
 * `modules/`, and the picker should not need a round trip to know what a
 * currency is.
 *
 * **The server list is the authority.** This one only decides what appears in a
 * dropdown; the server refuses anything not on its own list, so a stale copy
 * here can never let an invalid currency through.
 */
export const CURRENCY_CODES: readonly string[] = [
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRU',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLE',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'UYU',
  'UZS',
  'VES',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XCD',
  'XOF',
  'XPF',
  'YER',
  'ZAR',
  'ZMW',
  'ZWG',
]

/**
 * The currency's name, from the browser rather than a table we maintain.
 *
 * `Intl.DisplayNames` already knows every one of these and localises them, so
 * shipping 160 hard-coded English names would be both larger and worse. Falls
 * back to the bare code if the runtime does not support it.
 */
function currencyName(code: string, locale?: string): string {
  try {
    const name = new Intl.DisplayNames(locale ? [locale] : undefined, {
      type: 'currency',
    }).of(code)
    return name && name !== code ? name : ''
  } catch {
    return ''
  }
}

export interface CurrencyOption {
  value: string
  label: string
}

/**
 * Options for a currency picker, searchable by both code and name — someone
 * looking for rupiah should find it by typing "rupiah" as well as "IDR".
 *
 * `exclude` drops codes already chosen, so the list never offers a duplicate.
 */
export function currencyOptions(
  options: { exclude?: readonly string[]; locale?: string } = {}
): CurrencyOption[] {
  const skip = new Set((options.exclude ?? []).map((code) => code.toUpperCase()))

  return CURRENCY_CODES.filter((code) => !skip.has(code)).map((code) => {
    const name = currencyName(code, options.locale)
    return { value: code, label: name ? `${code} — ${name}` : code }
  })
}
