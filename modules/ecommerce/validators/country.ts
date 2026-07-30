import vine from '@vinejs/vine'
import { normaliseCountry } from '#modules/ecommerce/services/country_codes'

/**
 * A country field must name a country we recognise.
 *
 * `fixedLength(2)` — what every one of these fields used to be — accepts `ZZ`
 * and `QQ`, and the storefront checkout API is public. A code that is not in
 * the list matches no shipping zone, so the order that carries it is quoted
 * nothing and ships nowhere; the mistake surfaces as a fulfilment problem days
 * later rather than as a rejected field.
 *
 * Two things happen here, and both matter:
 *
 *  - **Membership.** Checked against `country_codes`, the one authority — the
 *    admin pickers, the storefront pickers and this rule all read the same
 *    list, so the UI cannot offer something the server will refuse and an API
 *    client cannot send something the UI would not have offered.
 *  - **Normalisation.** The value is rewritten to its stored (upper) form via
 *    `field.mutate`, so `"id"` from an API client is saved as `ID`. Zones match
 *    on exact string equality, so a lowercase code that reached the database
 *    would silently match nothing.
 *
 * Not implicit: `null` and `undefined` skip the rule entirely, which is what
 * keeps the optional country on store settings optional.
 */
export const countryCode = vine.createRule<{ message?: string } | undefined>(
  (value, options, field) => {
    /**
     * Only reachable if a caller turned `bail` off — the string rule has
     * already reported the type failure, and re-reporting would show the
     * operator two errors for one field.
     */
    if (typeof value !== 'string') return

    const code = normaliseCountry(value)

    if (code === null) {
      /**
       * The message never quotes the value back. It is rendered into an admin
       * toast and returned in a public 422 body, and the value on this path is
       * by definition something we did not put there.
       */
      field.report(options?.message ?? 'Select a valid country.', 'countryCode', field)
      return
    }

    field.mutate(code, field)
  }
)
