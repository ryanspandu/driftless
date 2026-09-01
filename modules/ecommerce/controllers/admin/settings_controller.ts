import type { HttpContext } from '@adonisjs/core/http'
import CurrencyService from '#modules/ecommerce/services/currency_service'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import ShippingZone from '#modules/ecommerce/models/shipping_zone'
import ShippingMethod from '#modules/ecommerce/models/shipping_method'
import ShippingRate from '#modules/ecommerce/models/shipping_rate'
import { isKnownCurrency } from '#modules/ecommerce/services/currency_codes'
import vine from '@vinejs/vine'
import { renderPage } from '#helpers/inertia_render'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import { countryCode } from '#modules/ecommerce/validators/country'

const updateValidator = vine.compile(
  vine.object({
    storeName: vine.string().trim().maxLength(160).nullable().optional(),
    storeEmail: vine.string().trim().email().maxLength(254).nullable().optional(),
    supportEmail: vine.string().trim().email().maxLength(254).nullable().optional(),
    addressLine1: vine.string().trim().maxLength(255).nullable().optional(),
    addressLine2: vine.string().trim().maxLength(255).nullable().optional(),
    city: vine.string().trim().maxLength(128).nullable().optional(),
    state: vine.string().trim().maxLength(128).nullable().optional(),
    postalCode: vine.string().trim().maxLength(32).nullable().optional(),
    // Still optional — a shop that has not filled its address in yet is fine.
    // What is no longer allowed is filling it in with something that is not a
    // country: the value ends up on invoices and in tax figures.
    country: vine.string().trim().use(countryCode()).nullable().optional(),
    currency: vine.string().trim().fixedLength(3).optional(),
    /**
     * Acknowledges that switching the base currency reinterprets every stored
     * price. The service decides whether it is needed.
     */
    confirmRepricing: vine.boolean().optional(),
    locale: vine.string().trim().maxLength(16).optional(),
    /** A percentage, e.g. 8.25 — the only place a decimal is accepted, and it
     *  is converted to an integer before it is stored. */
    taxRatePercent: vine.number().min(0).max(100).optional(),
    taxInclusive: vine.boolean().optional(),
    taxLabel: vine.string().trim().maxLength(32).optional(),
    checkoutTtlMinutes: vine.number().min(5).max(1_440).withoutDecimals().optional(),
    refundWindowDays: vine.number().min(0).max(365).withoutDecimals().optional(),
    affiliateCookieDays: vine.number().min(1).max(365).withoutDecimals().optional(),
    orderNumberPrefix: vine.string().trim().maxLength(16).optional(),
    /**
     * Which builder page fills each storefront slot. A blank string clears the
     * override (the service coerces `'' -> null`), so they are nullable too.
     * Listed explicitly because the validator drops keys it does not name — an
     * unlisted `shopPageId` would never reach the service.
     */
    productPageId: vine.string().trim().nullable().optional(),
    shopPageId: vine.string().trim().nullable().optional(),
    cartPageId: vine.string().trim().nullable().optional(),
    checkoutPageId: vine.string().trim().nullable().optional(),
    orderPageId: vine.string().trim().nullable().optional(),
    accountPageId: vine.string().trim().nullable().optional(),
    loginPageId: vine.string().trim().nullable().optional(),
    registerPageId: vine.string().trim().nullable().optional(),
  })
)

/**
 * The country lists inside a shipping payload, and nothing else — the rest of
 * that payload is parsed by hand in `updateShipping`.
 *
 * Those codes get a validator of their own because they are the part a typo
 * breaks silently: zones match an address on exact string equality, so a code
 * that is not a country matches nobody. The zone goes on looking correct on
 * screen while quietly covering one country fewer, and the first sign of it is
 * a buyer who cannot be quoted a rate.
 */
const zoneCountriesValidator = vine.compile(
  vine.object({
    zones: vine.array(
      vine.object({
        countries: vine.array(
          vine
            .string()
            .trim()
            .use(
              countryCode({
                // Says which list it came from: the operator is editing several
                // zones at once and the field path alone is `zones.2.countries.0`.
                message: 'A shipping zone lists a country we do not recognise.',
              })
            )
        ),
      })
    ),
  })
)

const settings = new StoreSettingsService()
const audit = new AuditLogService()

export default class EcommerceSettingsController {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/settings/index', {})
  }

  async show({ response }: HttpContext) {
    return response.json(await settings.getDto())
  }

  async update(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(updateValidator)
      const before = await settings.getDto()
      const after = await settings.update(payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'store.settings_updated',
        subjectType: 'ecommerce_settings',
        subjectId: 'default',
        changes: { before, after },
        ctx,
      })

      return response.json(after)
    } catch (error) {
      return apiFail(response, error, 'ecommerce/settings')
    }
  }

  /** Currencies this store sells in, base first. */
  async currencies({ response }: HttpContext) {
    return response.json(await new CurrencyService().enabled())
  }

  /**
   * Replace the set of additional currencies.
   *
   * The base is never in this list — it lives in the store's own settings and
   * is always sold in, so passing it is simply ignored rather than rejected.
   */
  async updateCurrencies(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const raw = request.input('codes')
      const codes = Array.isArray(raw) ? raw.map((c) => String(c)) : []

      const enabled = await new CurrencyService().replace(codes)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'ecommerce.currencies_changed',
        subjectType: 'store',
        subjectId: 'settings',
        changes: { codes: enabled.map((c) => c.code) },
        ctx,
      })

      return response.json(enabled)
    } catch (error) {
      return apiFail(response, error, 'ecommerce/currencies')
    }
  }

  // ── Shipping ─────────────────────────────────────────────────────────────

  /** Zones with their methods and any non-base rates, ready to edit. */
  async shipping({ response }: HttpContext) {
    const zones = await ShippingZone.query().whereNull('deleted_at').orderBy('position', 'asc')
    const methods = await ShippingMethod.query().whereNull('deleted_at').orderBy('position', 'asc')
    const rates = await ShippingRate.all()

    const ratesByMethod = new Map<string, ShippingRate[]>()
    for (const rate of rates) {
      const list = ratesByMethod.get(rate.methodId) ?? []
      list.push(rate)
      ratesByMethod.set(rate.methodId, list)
    }

    return response.json(
      zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        countries: zone.countries ?? [],
        states: zone.states ?? [],
        enabled: zone.enabled,
        position: zone.position,
        methods: methods
          .filter((method) => method.zoneId === zone.id)
          .map((method) => ({
            id: method.id,
            name: method.name,
            description: method.description,
            rateAmount: method.rateAmount,
            freeAboveAmount: method.freeAboveAmount,
            minDeliveryDays: method.minDeliveryDays,
            maxDeliveryDays: method.maxDeliveryDays,
            enabled: method.enabled,
            position: method.position,
            rates: (ratesByMethod.get(method.id) ?? []).map((rate) => ({
              currency: rate.currency.toUpperCase(),
              rateAmount: rate.rateAmount,
              freeAboveAmount: rate.freeAboveAmount,
            })),
          })),
      }))
    )
  }

  /**
   * Replace the whole shipping configuration in one call.
   *
   * Wholesale rather than per-row because zones, methods and rates only make
   * sense together: a method with no zone charges nobody, and a half-applied
   * edit could leave a shop quoting a rate it no longer means. The client sends
   * the shape it wants; anything absent is removed.
   */
  async updateShipping(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const raw = request.input('zones')
      if (!Array.isArray(raw)) {
        throw publicError.unprocessable('Expected a list of zones.', 'invalid_zones')
      }

      const wholeMinor = (value: unknown, label: string): number => {
        const amount = Math.trunc(Number(value ?? 0))
        if (!Number.isSafeInteger(amount) || amount < 0) {
          throw publicError.unprocessable(
            `${label} must be a positive whole number of minor units.`,
            'invalid_amount'
          )
        }
        return amount
      }

      /** States only — there is no list of subdivisions to check them against. */
      const codes = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.map((code) => String(code).trim().toUpperCase()).filter((code) => code.length > 0)
          : []

      /**
       * Countries are checked, and upper-cased, before a single row is touched.
       * Up front rather than inside the loop because the rebuild opens by
       * deleting every zone: a code rejected halfway through would leave the
       * shop with part of its shipping configuration simply gone.
       */
      const { zones: checked } = await zoneCountriesValidator.validate({
        zones: raw.map((zone) => ({
          // Anything that is not a list is treated as no list at all, which is
          // what the old helper did. This change adds a membership check, not
          // a stricter shape.
          countries: Array.isArray(zone?.countries) ? zone.countries : [],
        })),
      })

      /**
       * Rebuilt from scratch. `ShippingRate` and `ShippingMethod` both cascade
       * from their parent, so deleting the zones takes the rest with them —
       * which is why this is a hard delete rather than a soft one.
       */
      await ShippingZone.query().delete()

      for (const [zoneIndex, zoneInput] of raw.entries()) {
        const zone = await ShippingZone.create({
          id: newUlid(),
          name: String(zoneInput?.name ?? '').trim() || `Zone ${zoneIndex + 1}`,
          countries: checked[zoneIndex].countries,
          states: codes(zoneInput?.states),
          position: zoneIndex,
          enabled: zoneInput?.enabled !== false,
        })

        const methods = Array.isArray(zoneInput?.methods) ? zoneInput.methods : []

        for (const [methodIndex, methodInput] of methods.entries()) {
          const method = await ShippingMethod.create({
            id: newUlid(),
            zoneId: zone.id,
            name: String(methodInput?.name ?? '').trim() || 'Standard',
            description: methodInput?.description ? String(methodInput.description) : null,
            rateAmount: wholeMinor(methodInput?.rateAmount, 'The rate'),
            /**
             * Null and zero mean different things: null disables free shipping,
             * zero makes everything free. An empty field must become null.
             */
            freeAboveAmount:
              methodInput?.freeAboveAmount === null ||
              methodInput?.freeAboveAmount === undefined ||
              methodInput?.freeAboveAmount === ''
                ? null
                : wholeMinor(methodInput.freeAboveAmount, 'The free-shipping threshold'),
            minDeliveryDays: methodInput?.minDeliveryDays
              ? Math.trunc(Number(methodInput.minDeliveryDays))
              : null,
            maxDeliveryDays: methodInput?.maxDeliveryDays
              ? Math.trunc(Number(methodInput.maxDeliveryDays))
              : null,
            enabled: methodInput?.enabled !== false,
            position: methodIndex,
          })

          const rates = Array.isArray(methodInput?.rates) ? methodInput.rates : []
          const base = await new CurrencyService().baseCurrency()

          for (const rateInput of rates) {
            const currency = String(rateInput?.currency ?? '')
              .trim()
              .toUpperCase()
            // The base rate lives on the method; a row here would duplicate it.
            /**
             * Skipped rather than rejected: the base rate lives on the method,
             * so a row for it would duplicate it, and a code the shop does not
             * sell in has nothing to price.
             */
            if (!isKnownCurrency(currency) || currency === base) continue

            await ShippingRate.create({
              id: newUlid(),
              methodId: method.id,
              currency,
              rateAmount: wholeMinor(rateInput?.rateAmount, `The ${currency} rate`),
              freeAboveAmount:
                rateInput?.freeAboveAmount === null ||
                rateInput?.freeAboveAmount === undefined ||
                rateInput?.freeAboveAmount === ''
                  ? null
                  : wholeMinor(rateInput.freeAboveAmount, `The ${currency} threshold`),
            })
          }
        }
      }

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'ecommerce.shipping_changed',
        subjectType: 'store',
        subjectId: 'shipping',
        changes: { zoneCount: raw.length },
        ctx,
      })

      return this.shipping(ctx)
    } catch (error) {
      return apiFail(response, error, 'ecommerce/shipping')
    }
  }

  /**
   * Create the default storefront pages on demand.
   *
   * `onEnable` only fires on the off→on edge, so a store that was already
   * running when this feature shipped never gets them — and `/shop` 404s with
   * nothing on screen explaining why. This is the way back for those, and for
   * anyone who deleted the pages and changed their mind.
   *
   * Uses the same seeder as `onEnable`, so it inherits the same guarantees: it
   * creates nothing that already exists and overwrites nothing at all.
   */
  async seedStorefront(ctx: HttpContext) {
    const { response, auth } = ctx
    try {
      const { default: StorefrontSeederService } =
        await import('#modules/ecommerce/services/storefront_seeder_service')
      const result = await new StorefrontSeederService().seed()

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'ecommerce.storefront_seeded',
        subjectType: 'store',
        subjectId: 'storefront',
        changes: { created: result.created },
        ctx,
      })

      return response.json(result)
    } catch (error) {
      return apiFail(response, error, 'ecommerce/storefront-seed')
    }
  }
}
