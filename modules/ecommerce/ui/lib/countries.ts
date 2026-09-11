/**
 * Country codes for the pickers.
 *
 * A copy of `modules/ecommerce/services/country_codes.ts`, following the same
 * client-boundary convention as the currency and money helpers: `inertia/` has
 * no path into `modules/`, and a dropdown should not need a round trip to know
 * what a country is.
 *
 * **The server list is the authority.** This one only decides what appears in a
 * menu; the server refuses anything not on its own list, so a stale copy here
 * can never let an invalid country through.
 *
 * `XK` (Kosovo) is here for the reason given on the server list: not ISO, but
 * refusing it would mean a real buyer cannot enter their own address.
 */
export const COUNTRY_CODES: readonly string[] = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
]

/**
 * The country's name, from the browser rather than a table we maintain.
 *
 * `Intl.DisplayNames` already knows every one of these and localises them, so
 * shipping hard-coded English names would be both larger and worse for anyone
 * not reading in English. Falls back to the bare code if the runtime cannot.
 */
export function countryName(code: string, locale?: string): string {
  try {
    const name = new Intl.DisplayNames(locale ? [locale] : undefined, {
      type: 'region',
    }).of(code)
    return name && name !== code ? name : ''
  } catch {
    return ''
  }
}

export interface CountryOption {
  value: string
  label: string
}

/** Built once per locale — 250 `Intl` lookups and a sort is not per-render work. */
const optionCache = new Map<string, CountryOption[]>()

/**
 * Options for a country picker, sorted by **name** rather than by code.
 *
 * Sorting by code would put Åland before Afghanistan and Andorra before the
 * United Arab Emirates — an order that means nothing to someone scanning the
 * list. `localeCompare` also gets the accented names right.
 */
export function countryOptions(locale?: string): CountryOption[] {
  const key = locale ?? ''
  const cached = optionCache.get(key)
  if (cached) return cached

  const options = COUNTRY_CODES.map((code) => {
    const name = countryName(code, locale)
    return { value: code, label: name || code }
  }).sort((a, b) => a.label.localeCompare(b.label, locale))

  optionCache.set(key, options)
  return options
}
