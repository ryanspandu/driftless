import EcommerceSetting from '#modules/ecommerce/models/setting'
import { isKnownCurrency } from '#modules/ecommerce/services/currency_codes'
import { publicError } from '#exceptions/public_error'

const ROW_ID = 'default'

export interface StoreSettingsDto {
  storeName: string | null
  storeEmail: string | null
  supportEmail: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  currency: string
  locale: string
  /** Percentage, e.g. `8.25`. Stored as an integer internally. */
  taxRatePercent: number
  taxInclusive: boolean
  taxLabel: string
  checkoutTtlMinutes: number
  refundWindowDays: number
  affiliateCookieDays: number
  orderNumberPrefix: string
  productPageId: string | null
  shopPageId: string | null
  /** Optional builder-page overrides for the storefront app screens. */
  cartPageId: string | null
  checkoutPageId: string | null
  orderPageId: string | null
  accountPageId: string | null
  loginPageId: string | null
  registerPageId: string | null
}

export interface UpdateStoreSettingsDto extends Partial<Omit<StoreSettingsDto, 'taxRatePercent'>> {
  taxRatePercent?: number
  /**
   * Acknowledges that changing the base currency reinterprets every stored
   * price. Required only when products exist; ignored otherwise.
   */
  confirmRepricing?: boolean
}

export default class StoreSettingsService {
  async getOrCreate(): Promise<EcommerceSetting> {
    const existing = await EcommerceSetting.find(ROW_ID)
    if (existing) return existing

    /**
     * Every default is spelled out rather than left to the column defaults.
     *
     * Lucid does not read a column default back into the instance it just
     * created, so `EcommerceSetting.create({ id })` returns a row whose
     * `currency` is `undefined` in memory even though the database wrote
     * 'USD'. Anything reading `settings.currency` on that instance then
     * propagates `undefined` — which is how a product was briefly created with
     * a NULL currency.
     */
    return EcommerceSetting.create({
      id: ROW_ID,
      currency: 'USD',
      locale: 'en-US',
      taxRateMicro: 0,
      taxInclusive: false,
      taxLabel: 'Tax',
      checkoutTtlMinutes: 60,
      refundWindowDays: 30,
      affiliateCookieDays: 30,
      orderNumberPrefix: 'ORD-',
      productPageId: null,
      shopPageId: null,
      cartPageId: null,
      checkoutPageId: null,
      orderPageId: null,
      accountPageId: null,
      loginPageId: null,
      registerPageId: null,
    })
  }

  async getDto(): Promise<StoreSettingsDto> {
    const row = await this.getOrCreate()
    return {
      storeName: row.storeName,
      storeEmail: row.storeEmail,
      supportEmail: row.supportEmail,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
      currency: row.currency,
      locale: row.locale,
      taxRatePercent: row.taxRatePercent,
      taxInclusive: row.taxInclusive,
      taxLabel: row.taxLabel,
      checkoutTtlMinutes: row.checkoutTtlMinutes,
      refundWindowDays: row.refundWindowDays,
      affiliateCookieDays: row.affiliateCookieDays,
      orderNumberPrefix: row.orderNumberPrefix,
      productPageId: row.productPageId,
      shopPageId: row.shopPageId,
      cartPageId: row.cartPageId,
      checkoutPageId: row.checkoutPageId,
      orderPageId: row.orderPageId,
      accountPageId: row.accountPageId,
      loginPageId: row.loginPageId,
      registerPageId: row.registerPageId,
    }
  }

  async update(dto: UpdateStoreSettingsDto): Promise<StoreSettingsDto> {
    const row = await this.getOrCreate()

    /**
     * The new base code, set only when the currency actually changes, so the
     * catalogue can be relabelled in the same commit further down.
     */
    let repricedTo: string | null = null

    if (dto.currency !== undefined) {
      const code = dto.currency.trim().toUpperCase()

      /**
       * Checked against the ISO list. `exponentOf` cannot do this job — it
       * returns 2 for anything it does not recognise rather than throwing, so
       * the guard that used to live here validated nothing at all.
       */
      if (!isKnownCurrency(code)) {
        throw publicError.unprocessable(
          `"${dto.currency}" is not a currency this shop can sell in.`,
          'invalid_currency'
        )
      }

      if (code !== row.currency) {
        const { default: db } = await import('@adonisjs/lucid/services/db')
        repricedTo = code

        /**
         * Orders are the hard stop.
         *
         * Each order records the currency it was charged in, so history stays
         * correct — but the store's own figures would then span two units with
         * nothing to reconcile them, and this module has no exchange rates by
         * design. Refusing is the only honest answer.
         */
        const existing = await db.from('ecommerce_orders').select('id').first()
        if (existing) {
          throw publicError.unprocessable(
            'The store currency cannot be changed once orders exist. Historical orders keep the currency they were charged in, and new totals would be ambiguous.',
            'currency_locked'
          )
        }

        /**
         * Products are a softer stop, but a real one.
         *
         * Prices are stored as minor units with no currency attached: a
         * variant at `10000` is $100.00 today and Rp10.000 the moment the base
         * becomes IDR — a 99.9% price cut nobody asked for. Recoverable, since
         * the merchant can re-enter them, so this asks rather than refuses.
         */
        const priced = await db
          .from('ecommerce_product_variants')
          .whereNull('deleted_at')
          .count('* as total')
          .first()

        const count = Number((priced as { total?: string | number } | undefined)?.total ?? 0)

        if (count > 0 && !dto.confirmRepricing) {
          throw publicError.unprocessable(
            `${count} product ${count === 1 ? 'price is' : 'prices are'} stored in ${row.currency}. Switching to ${code} reinterprets each of them as ${code} — the numbers stay, their value does not. Confirm to continue, then check every price.`,
            'currency_change_reprices'
          )
        }
      }

      row.currency = code
    }

    if (dto.storeName !== undefined) row.storeName = dto.storeName || null
    if (dto.storeEmail !== undefined) row.storeEmail = dto.storeEmail || null
    if (dto.supportEmail !== undefined) row.supportEmail = dto.supportEmail || null
    if (dto.addressLine1 !== undefined) row.addressLine1 = dto.addressLine1 || null
    if (dto.addressLine2 !== undefined) row.addressLine2 = dto.addressLine2 || null
    if (dto.city !== undefined) row.city = dto.city || null
    if (dto.state !== undefined) row.state = dto.state || null
    if (dto.postalCode !== undefined) row.postalCode = dto.postalCode || null
    if (dto.country !== undefined) row.country = dto.country ? dto.country.toUpperCase() : null
    if (dto.locale !== undefined) row.locale = dto.locale || 'en-US'

    if (dto.taxRatePercent !== undefined) {
      if (
        !Number.isFinite(dto.taxRatePercent) ||
        dto.taxRatePercent < 0 ||
        dto.taxRatePercent > 100
      ) {
        throw publicError.unprocessable('Tax rate must be between 0 and 100.', 'invalid_tax_rate')
      }
      // Percent → integer micro units, so the stored rate is never a float.
      row.taxRateMicro = Math.round(dto.taxRatePercent * 10_000)
    }
    if (dto.taxInclusive !== undefined) row.taxInclusive = dto.taxInclusive
    if (dto.taxLabel !== undefined) row.taxLabel = dto.taxLabel || 'Tax'

    if (dto.checkoutTtlMinutes !== undefined) {
      row.checkoutTtlMinutes = Math.min(Math.max(dto.checkoutTtlMinutes, 5), 1_440)
    }
    if (dto.refundWindowDays !== undefined) {
      row.refundWindowDays = Math.min(Math.max(dto.refundWindowDays, 0), 365)
    }
    if (dto.affiliateCookieDays !== undefined) {
      row.affiliateCookieDays = Math.min(Math.max(dto.affiliateCookieDays, 1), 365)
    }
    if (dto.productPageId !== undefined) {
      row.productPageId = dto.productPageId || null
    }
    if (dto.shopPageId !== undefined) {
      row.shopPageId = dto.shopPageId || null
    }
    if (dto.cartPageId !== undefined) {
      row.cartPageId = dto.cartPageId || null
    }
    if (dto.checkoutPageId !== undefined) {
      row.checkoutPageId = dto.checkoutPageId || null
    }
    if (dto.orderPageId !== undefined) {
      row.orderPageId = dto.orderPageId || null
    }
    if (dto.accountPageId !== undefined) {
      row.accountPageId = dto.accountPageId || null
    }
    if (dto.loginPageId !== undefined) {
      row.loginPageId = dto.loginPageId || null
    }
    if (dto.registerPageId !== undefined) {
      row.registerPageId = dto.registerPageId || null
    }
    if (dto.orderNumberPrefix !== undefined) {
      row.orderNumberPrefix = (dto.orderNumberPrefix || 'ORD-').slice(0, 16)
    }

    if (repricedTo === null) {
      await row.save()
      return this.getDto()
    }

    /**
     * `ecommerce_products.currency` is a denormalised copy of the store's base
     * — every product is created with `settings.currency` — so a base switch
     * has to carry it along. Leaving it stale is what put "$15.00" on a product
     * whose every total read "IDR 15.00": the catalogue label formats with the
     * product's own currency while pricing uses the base, and the two had
     * quietly diverged.
     *
     * This relabels; it does not convert. That is the switch's stated bargain —
     * "the numbers stay, their value does not" — and there are no exchange
     * rates in this module by design.
     *
     * Soft-deleted rows are included on purpose: one restored later would
     * otherwise come back still claiming the old currency.
     */
    const { default: db } = await import('@adonisjs/lucid/services/db')
    const { DateTime } = await import('luxon')

    await db.transaction(async (trx) => {
      row.useTransaction(trx)
      await row.save()

      await trx
        .from('ecommerce_products')
        .update({ currency: repricedTo, updated_at: DateTime.now().toSQL() })
    })

    return this.getDto()
  }
}
