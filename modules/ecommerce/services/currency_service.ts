import type { HttpContext } from '@adonisjs/core/http'
import { publicError } from '#exceptions/public_error'
import { newUlid } from '#services/ulid_service'
import StoreCurrency from '#modules/ecommerce/models/store_currency'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { exponentOf } from '#modules/ecommerce/services/money'
import { isKnownCurrency } from '#modules/ecommerce/services/currency_codes'

const settings = new StoreSettingsService()

/**
 * The cookie carrying the shopper's chosen currency.
 *
 * Plain and readable — unlike the cart and session cookies there is nothing to
 * protect here. It holds a *preference*, not a credential: the code is
 * validated against the store's enabled list on every request, and it selects
 * which listed price to read, never what anything costs. Tampering with it can
 * only ask for a currency the store already sells in.
 */
export const CURRENCY_COOKIE = 'dl_currency'

export interface CurrencyDto {
  code: string
  /** Decimal places, from the ISO 4217 exponent table in `money.ts`. */
  exponent: number
  /** True for the store's base currency, which can never be disabled. */
  isBase: boolean
}

/**
 * A real currency code, or null.
 *
 * Checked against the ISO 4217 list rather than `/^[A-Z]{3}$/`: three arbitrary
 * letters would let a typo become a currency the shop then prices a whole
 * catalogue in, with the mistake only surfacing when a buyer cannot pay.
 */
function normalise(code: unknown): string | null {
  if (!isKnownCurrency(code)) return null
  return (code as string).trim().toUpperCase()
}

export default class CurrencyService {
  /**
   * Every currency this store sells in, base first.
   *
   * The base is always present whether or not it has a row, so a store that has
   * never touched this feature reports exactly one currency and behaves
   * precisely as it did before multi-currency existed.
   */
  async enabled(): Promise<CurrencyDto[]> {
    const store = await settings.getOrCreate()
    const base = store.currency.toUpperCase()

    const rows = await StoreCurrency.query().where('enabled', true).orderBy('position', 'asc')

    const codes = [base, ...rows.map((row) => row.code.toUpperCase())]
    const seen = new Set<string>()

    return codes
      .filter((code) => {
        if (seen.has(code)) return false
        seen.add(code)
        return true
      })
      .map((code) => ({ code, exponent: exponentOf(code), isBase: code === base }))
  }

  async baseCurrency(): Promise<string> {
    return (await settings.getOrCreate()).currency.toUpperCase()
  }

  /** True when the store sells in this currency right now. */
  async isEnabled(code: string): Promise<boolean> {
    const wanted = normalise(code)
    if (!wanted) return false
    return (await this.enabled()).some((currency) => currency.code === wanted)
  }

  /**
   * The currency for this request.
   *
   * Order of preference: an explicit `?currency=`, then the cookie, then the
   * store's base. Anything unrecognised or not enabled falls back to base
   * **silently** — a shopper arriving on a stale link from when the store sold
   * in NOK should see prices, not an error.
   *
   * That silence is safe precisely because this only chooses *which listed
   * price to read*. It can never invent a price, and a currency the store does
   * not sell in resolves to one it does.
   */
  async forRequest(ctx: HttpContext): Promise<string> {
    const base = await this.baseCurrency()
    const requested =
      normalise(ctx.request.input('currency')) ?? normalise(ctx.request.cookie(CURRENCY_COOKIE))

    if (!requested || requested === base) return base
    return (await this.isEnabled(requested)) ? requested : base
  }

  /** Remember the shopper's choice. Refuses a currency the store does not sell in. */
  async remember(ctx: HttpContext, code: string): Promise<string> {
    const wanted = normalise(code)
    if (!wanted || !(await this.isEnabled(wanted))) {
      throw publicError.unprocessable(
        'This shop does not sell in that currency.',
        'currency_unavailable'
      )
    }

    ctx.response.cookie(CURRENCY_COOKIE, wanted, {
      maxAge: '365 days',
      httpOnly: false,
      sameSite: 'lax',
    })

    return wanted
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  /** Every row an operator can edit — the base is managed in store settings. */
  async list(): Promise<CurrencyDto[]> {
    const base = await this.baseCurrency()
    const rows = await StoreCurrency.query().orderBy('position', 'asc')

    return rows.map((row) => ({
      code: row.code.toUpperCase(),
      exponent: exponentOf(row.code),
      isBase: row.code.toUpperCase() === base,
    }))
  }

  /**
   * Replace the set of additional currencies.
   *
   * The base is filtered out rather than rejected: it is always sold in, so a
   * row for it would be redundant, and refusing the whole request over a
   * harmless duplicate would just be annoying.
   */
  async replace(codes: string[]): Promise<CurrencyDto[]> {
    const base = await this.baseCurrency()

    const wanted: string[] = []
    for (const raw of codes) {
      const code = normalise(raw)
      if (!code) {
        throw publicError.unprocessable(
          `"${String(raw)}" is not a currency this shop can sell in.`,
          'invalid_currency'
        )
      }
      if (code === base || wanted.includes(code)) continue
      wanted.push(code)
    }

    const existing = await StoreCurrency.all()
    const byCode = new Map(existing.map((row) => [row.code.toUpperCase(), row]))

    for (const [index, code] of wanted.entries()) {
      const row = byCode.get(code)
      if (row) {
        row.enabled = true
        row.position = index
        await row.save()
        byCode.delete(code)
      } else {
        await StoreCurrency.create({ id: newUlid(), code, enabled: true, position: index })
      }
    }

    /**
     * Whatever is left is being switched off. Disabled rather than deleted, so
     * the prices already listed against it survive — a merchant who turns EUR
     * off for a month should not lose every euro price they set.
     */
    for (const row of byCode.values()) {
      if (!row.enabled) continue
      row.enabled = false
      await row.save()
    }

    return this.enabled()
  }
}
