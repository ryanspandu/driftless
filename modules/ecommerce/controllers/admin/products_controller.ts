import type { HttpContext } from '@adonisjs/core/http'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import VariantPrice from '#modules/ecommerce/models/variant_price'
import CurrencyService from '#modules/ecommerce/services/currency_service'
import vine from '@vinejs/vine'
import { renderPage } from '#helpers/inertia_render'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import CatalogService from '#modules/ecommerce/services/catalog_service'

/**
 * Amounts arrive as **integer minor units**, never as a decimal string or a
 * float. The client's `MoneyInput` parses what someone types into an integer
 * before it ever leaves the browser, and the validator refuses anything else.
 */
const moneyField = () => vine.number().min(0).max(Number.MAX_SAFE_INTEGER).withoutDecimals()

const optionSchema = vine.object({
  name: vine.string().trim().minLength(1).maxLength(64),
  values: vine.array(vine.string().trim().maxLength(64)).maxLength(50),
})

const imageSchema = vine.object({
  mediaUrl: vine.string().trim().maxLength(1024),
  alt: vine.string().trim().maxLength(255).nullable().optional(),
})

const createProductValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    slug: vine.string().trim().maxLength(200).optional(),
    subtitle: vine.string().trim().maxLength(255).nullable().optional(),
    description: vine.object({}).allowUnknownProperties().optional(),
    type: vine.enum(['physical', 'digital'] as const).optional(),
    status: vine.enum(['draft', 'active', 'archived'] as const).optional(),
    seo: vine.object({}).allowUnknownProperties().optional(),
    options: vine.array(optionSchema).maxLength(3).optional(),
    featured: vine.boolean().optional(),
    /**
     * What the buy button does. `external` also needs `externalUrl`, which the
     * service enforces — the two are one decision, so validating them apart
     * here would let a half-set state through.
     */
    ctaMode: vine.enum(['add_to_cart', 'buy_now', 'external'] as const).optional(),
    externalUrl: vine.string().trim().maxLength(500).nullable().optional(),
    externalLabel: vine.string().trim().maxLength(80).nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
    categoryIds: vine.array(vine.string().trim()).maxLength(20).optional(),
    images: vine.array(imageSchema).maxLength(20).optional(),
  })
)

const updateProductValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255).optional(),
    slug: vine.string().trim().maxLength(200).optional(),
    subtitle: vine.string().trim().maxLength(255).nullable().optional(),
    description: vine.object({}).allowUnknownProperties().optional(),
    type: vine.enum(['physical', 'digital'] as const).optional(),
    status: vine.enum(['draft', 'active', 'archived'] as const).optional(),
    seo: vine.object({}).allowUnknownProperties().optional(),
    options: vine.array(optionSchema).maxLength(3).optional(),
    featured: vine.boolean().optional(),
    /**
     * What the buy button does. `external` also needs `externalUrl`, which the
     * service enforces — the two are one decision, so validating them apart
     * here would let a half-set state through.
     */
    ctaMode: vine.enum(['add_to_cart', 'buy_now', 'external'] as const).optional(),
    externalUrl: vine.string().trim().maxLength(500).nullable().optional(),
    externalLabel: vine.string().trim().maxLength(80).nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
    categoryIds: vine.array(vine.string().trim()).maxLength(20).optional(),
    images: vine.array(imageSchema).maxLength(20).optional(),
  })
)

const createVariantValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    sku: vine.string().trim().maxLength(96).nullable().optional(),
    priceAmount: moneyField(),
    compareAtAmount: moneyField().nullable().optional(),
    costAmount: moneyField().nullable().optional(),
    weightGrams: vine.number().min(0).withoutDecimals().nullable().optional(),
    // A record of string→string: `{ Size: 'L', Colour: 'Blue' }`. Typed
    // explicitly rather than as an open object so the service receives the
    // shape it declares.
    optionValues: vine.record(vine.string().trim().maxLength(64)).optional(),
    stockOnHand: vine.number().min(0).withoutDecimals().optional(),
    trackInventory: vine.boolean().optional(),
    allowBackorder: vine.boolean().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)

const updateVariantValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255).optional(),
    sku: vine.string().trim().maxLength(96).nullable().optional(),
    priceAmount: moneyField().optional(),
    compareAtAmount: moneyField().nullable().optional(),
    costAmount: moneyField().nullable().optional(),
    weightGrams: vine.number().min(0).withoutDecimals().nullable().optional(),
    // A record of string→string: `{ Size: 'L', Colour: 'Blue' }`. Typed
    // explicitly rather than as an open object so the service receives the
    // shape it declares.
    optionValues: vine.record(vine.string().trim().maxLength(64)).optional(),
    stockOnHand: vine.number().min(0).withoutDecimals().optional(),
    trackInventory: vine.boolean().optional(),
    allowBackorder: vine.boolean().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)

const catalog = new CatalogService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/products')

export default class ProductsController {
  /** The category management screen. */
  async categoriesPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/products/categories', {})
  }

  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/products/index', {})
  }

  async newPage({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/products/edit', { productId: null })
  }

  async detailPage({ inertia, params }: HttpContext) {
    return renderPage(inertia, 'modules/ecommerce/admin/products/edit', {
      productId: String(params.id),
    })
  }

  async index({ request, response }: HttpContext) {
    const result = await catalog.list({
      page: Number(request.input('page', 1)) || 1,
      pageSize: Number(request.input('pageSize', 20)) || 20,
      search: request.input('search') || undefined,
      status: request.input('status') || undefined,
      type: request.input('type') || undefined,
      categoryId: request.input('categoryId') || undefined,
    })
    return response.json(result)
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await catalog.find(String(params.id)))
    } catch (error) {
      return fail(response, error)
    }
  }

  async store(ctx: HttpContext) {
    const { request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(createProductValidator)
      const product = await catalog.create(payload, (auth.user as User).id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'product.created',
        subjectType: 'product',
        subjectId: product.id,
        changes: { title: product.title, slug: product.slug, status: product.status },
        ctx,
      })

      return response.status(201).json(product)
    } catch (error) {
      return fail(response, error)
    }
  }

  async update(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(updateProductValidator)
      const product = await catalog.update(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'product.updated',
        subjectType: 'product',
        subjectId: product.id,
        changes: payload,
        ctx,
      })

      return response.json(product)
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroy(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await catalog.remove(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'product.deleted',
        subjectType: 'product',
        subjectId: id,
        ctx,
      })

      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
  }

  async storeVariant(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(createVariantValidator)
      const variant = await catalog.createVariant(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'variant.created',
        subjectType: 'variant',
        subjectId: variant.id,
        changes: { productId: params.id, title: variant.title, sku: variant.sku },
        amount: variant.price.amount,
        currency: variant.price.currency,
        ctx,
      })

      return response.status(201).json(variant)
    } catch (error) {
      return fail(response, error)
    }
  }

  async updateVariant(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(updateVariantValidator)
      const variant = await catalog.updateVariant(String(params.variantId), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'variant.updated',
        subjectType: 'variant',
        subjectId: variant.id,
        changes: payload,
        amount: variant.price.amount,
        currency: variant.price.currency,
        ctx,
      })

      return response.json(variant)
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroyVariant(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.variantId)
      await catalog.removeVariant(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'variant.deleted',
        subjectType: 'variant',
        subjectId: id,
        ctx,
      })

      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Listed prices for a variant, in every currency but the base. */
  async variantPrices({ params, response }: HttpContext) {
    const rows = await VariantPrice.query()
      .where('variant_id', String(params.variantId))
      .orderBy('currency', 'asc')

    return response.json(
      rows.map((row) => ({
        currency: row.currency.toUpperCase(),
        priceAmount: row.priceAmount,
        compareAtAmount: row.compareAtAmount,
      }))
    )
  }

  /**
   * Replace a variant's listed prices.
   *
   * Amounts are integer minor units in **that currency's** exponent — ¥1000 is
   * `1000`, $10.00 is `1000`. They are never derived from the base price;
   * there is no conversion anywhere in this module, which is precisely why a
   * missing entry means "not sold here" rather than "same number".
   */
  async updateVariantPrices(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const variantId = String(params.variantId)
      const currencies = new CurrencyService()
      const base = await currencies.baseCurrency()

      const raw = request.input('prices')
      const entries = Array.isArray(raw) ? raw : []

      const clean: { currency: string; priceAmount: number; compareAtAmount: number | null }[] = []
      for (const entry of entries) {
        const currency = String(entry?.currency ?? '')
          .trim()
          .toUpperCase()

        // The base price lives on the variant itself; a row here would be a
        // second source of truth for the same number.
        if (!currency || currency === base) continue

        // `isEnabled` already implies "is a real code" — `normalise` rejects
        // anything not on the ISO list before the lookup happens.
        if (!(await currencies.isEnabled(currency))) {
          throw publicError.unprocessable(
            `This shop does not sell in ${currency}.`,
            'currency_unavailable'
          )
        }

        const priceAmount = Math.trunc(Number(entry?.priceAmount))
        if (!Number.isSafeInteger(priceAmount) || priceAmount < 0) {
          throw publicError.unprocessable(
            `The ${currency} price must be a positive whole number of minor units.`,
            'invalid_price'
          )
        }

        const compareRaw = entry?.compareAtAmount
        const compareAtAmount =
          compareRaw === null || compareRaw === undefined || compareRaw === ''
            ? null
            : Math.trunc(Number(compareRaw))

        clean.push({ currency, priceAmount, compareAtAmount })
      }

      // Replace wholesale: anything the operator removed from the list stops
      // being sold in that currency, which is the intent of removing it.
      await VariantPrice.query().where('variant_id', variantId).delete()
      for (const entry of clean) {
        await VariantPrice.create({ id: newUlid(), variantId, ...entry })
      }

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'product.prices_changed',
        subjectType: 'variant',
        subjectId: variantId,
        changes: { currencies: clean.map((entry) => entry.currency) },
        ctx,
      })

      return response.json(clean)
    } catch (error) {
      return apiFail(response, error, 'ecommerce/variant-prices')
    }
  }
}
