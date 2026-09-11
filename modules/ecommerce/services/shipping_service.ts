import db from '@adonisjs/lucid/services/db'
import { publicError } from '#exceptions/public_error'
import type { AddressSnapshot } from '#modules/ecommerce/models/order'
import ShippingZone from '#modules/ecommerce/models/shipping_zone'
import ShippingMethod from '#modules/ecommerce/models/shipping_method'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const settings = new StoreSettingsService()

export interface ShippingDestination {
  country: string | null
  state?: string | null
}

export interface ShippingQuote {
  methodId: string
  name: string
  description: string | null
  /** What this order will actually be charged, after any free-shipping rule. */
  amount: number
  minDeliveryDays: number | null
  maxDeliveryDays: number | null
  /** True when a free-shipping threshold zeroed an otherwise non-zero rate. */
  free: boolean
}

export interface ShippingOptionDto extends Omit<ShippingQuote, 'amount'> {
  price: MoneyDto
}

function normaliseCode(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

export default class ShippingService {
  /**
   * The zone covering a destination, most specific first.
   *
   * A zone naming both the country and the state beats one naming only the
   * country, which beats the catch-all (empty `countries`). Ties break on
   * `position`, so an operator can order overlapping zones deliberately.
   *
   * Returns null when nothing matches — including when there are no zones at
   * all, which is how a store that has never configured shipping behaves.
   */
  async zoneFor(destination: ShippingDestination): Promise<ShippingZone | null> {
    const country = normaliseCode(destination.country)
    const state = normaliseCode(destination.state)

    const zones = await ShippingZone.query()
      .where('enabled', true)
      .whereNull('deleted_at')
      .orderBy('position', 'asc')

    let best: { zone: ShippingZone; score: number } | null = null

    for (const zone of zones) {
      const countries = (zone.countries ?? []).map(normaliseCode)
      const states = (zone.states ?? []).map(normaliseCode)

      let score: number
      if (countries.length === 0) {
        // Catch-all. Only ever wins if nothing more specific matched.
        score = 1
      } else if (!country || !countries.includes(country)) {
        continue
      } else if (states.length > 0) {
        if (!state || !states.includes(state)) continue
        score = 3
      } else {
        score = 2
      }

      if (!best || score > best.score) best = { zone, score }
    }

    return best?.zone ?? null
  }

  /**
   * Every method available for a destination, priced for this basket.
   *
   * Returns an empty list when no zone matches or the zone has no usable
   * method. The caller decides what that means — checkout refuses, the
   * storefront shows "we don't ship there".
   */
  async quotesFor(input: {
    destination: ShippingDestination
    subtotalAmount: number
    currency: string
  }): Promise<ShippingQuote[]> {
    const zone = await this.zoneFor(input.destination)
    if (!zone) return []

    const base = (await settings.getOrCreate()).currency.toUpperCase()
    const currency = input.currency.toUpperCase()

    const methods = await ShippingMethod.query()
      .where('zone_id', zone.id)
      .where('enabled', true)
      .whereNull('deleted_at')
      .orderBy('position', 'asc')

    if (methods.length === 0) return []

    /**
     * Listed rates for a non-base currency, loaded in one query.
     *
     * A method with no rate in this currency is **omitted**, not converted —
     * the same rule as product prices. Offering it at the base amount would
     * charge ¥500 for something priced $5.00.
     */
    const listed = new Map<string, { rate: number; freeAbove: number | null }>()
    if (currency !== base) {
      const rows = await db
        .from('ecommerce_shipping_rates')
        .whereIn(
          'method_id',
          methods.map((m) => m.id)
        )
        .where('currency', currency)
        .select('method_id', 'rate_amount', 'free_above_amount')

      for (const row of rows) {
        listed.set(String(row.method_id), {
          rate: Number(row.rate_amount),
          freeAbove: row.free_above_amount === null ? null : Number(row.free_above_amount),
        })
      }
    }

    const quotes: ShippingQuote[] = []

    for (const method of methods) {
      const priced =
        currency === base
          ? { rate: method.rateAmount, freeAbove: method.freeAboveAmount }
          : listed.get(method.id)

      if (!priced) continue

      /**
       * `freeAbove` of `null` means "no free shipping", which is deliberately
       * different from `0` — the latter would make every order free.
       */
      const free = priced.freeAbove !== null && input.subtotalAmount >= priced.freeAbove
      const amount = free ? 0 : priced.rate

      quotes.push({
        methodId: method.id,
        name: method.name,
        description: method.description,
        amount,
        minDeliveryDays: method.minDeliveryDays,
        maxDeliveryDays: method.maxDeliveryDays,
        free: free && priced.rate > 0,
      })
    }

    return quotes
  }

  /** The same list, formatted for a storefront picker. */
  async optionsFor(input: {
    destination: ShippingDestination
    subtotalAmount: number
    currency: string
  }): Promise<ShippingOptionDto[]> {
    const store = await settings.getOrCreate()
    const quotes = await this.quotesFor(input)

    return quotes.map(({ amount, ...rest }) => ({
      ...rest,
      price: Money.toDto(amount, input.currency.toUpperCase(), store.locale),
    }))
  }

  /**
   * What a chosen method costs — the only number checkout may charge.
   *
   * The client sends a **method id**, never a rate, and this re-derives the
   * amount from the destination and basket it was actually quoted for. A method
   * id from a different zone, a disabled method, or one with no rate in this
   * currency is refused rather than silently priced at zero: free shipping
   * nobody configured is a loss that shows up in the accounts, not on screen.
   */
  async rateFor(
    methodId: string,
    input: { destination: ShippingDestination; subtotalAmount: number; currency: string }
  ): Promise<ShippingQuote> {
    const quotes = await this.quotesFor(input)
    const match = quotes.find((quote) => quote.methodId === methodId)

    if (!match) {
      throw publicError.unprocessable(
        'That delivery option is not available for this address.',
        'shipping_method_unavailable'
      )
    }

    return match
  }

  /**
   * Whether any shipping is configured at all.
   *
   * A store with no zones has not set shipping up, and checkout must not demand
   * a choice it cannot offer — that would lock every physical order out of a
   * shop that was working fine before this feature existed.
   */
  async isConfigured(): Promise<boolean> {
    const row = await ShippingZone.query()
      .where('enabled', true)
      .whereNull('deleted_at')
      .count('* as total')
      .first()

    return Number((row as unknown as { $extras: { total: number } })?.$extras?.total ?? 0) > 0
  }

  /** A destination from the address a buyer supplied at checkout. */
  destinationFrom(address: AddressSnapshot | undefined): ShippingDestination {
    return { country: address?.country ?? null, state: address?.state ?? null }
  }
}
