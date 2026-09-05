import type { HttpContext } from '@adonisjs/core/http'
import { errors as vineErrors } from '@vinejs/vine'
import type User from '#models/user'

/**
 * Builder-API surface for e-commerce products, variants and categories.
 *
 * MCP is a module and must never STATICALLY import another module (`ecommerce`)
 * — that would break the build/typecheck the day ecommerce is removed, and
 * violates the one-way module rule (`modules/types.ts`). So this controller
 * reaches the ecommerce catalog only through guarded **dynamic `import()`**. The
 * routes carry `moduleEnabled({ name: 'ecommerce' })`, so if ecommerce is off
 * the request 404s at the route layer and these bodies never run.
 *
 * Thin wrapper: `CatalogService` is the write authority (transactions, slug
 * uniqueness, price-from refresh, category join sync); the shared vine
 * validators enforce the enum/bounds the service itself does not
 * (`modules/ecommerce/validators/catalog.ts`). Gated by
 * `ecommerce:products:manage` (RBAC) ∩ `builder:read`/`builder:products` (token)
 * at the route layer.
 */
export default class BuilderProductsController {
  private async catalog() {
    const { default: CatalogService } = await import('#modules/ecommerce/services/catalog_service')
    return new CatalogService()
  }

  private async validators() {
    return import('#modules/ecommerce/validators/catalog')
  }

  /**
   * Vine validation → 422 with `issues` (which the RPC forwarder preserves so
   * the AI can self-correct); a service `publicError` (e.g. not found) or any
   * other throw → the given fallback status + its message.
   */
  private failed(response: HttpContext['response'], e: unknown, fallback = 422) {
    if (e instanceof vineErrors.E_VALIDATION_ERROR) {
      return response.status(422).json({ message: 'Validation failed', issues: e.messages })
    }
    return response.status(fallback).json({ message: (e as Error).message })
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async index({ request, response }: HttpContext) {
    const catalog = await this.catalog()
    return response.json(
      await catalog.list({
        page: Number(request.input('page', 1)) || 1,
        pageSize: Number(request.input('pageSize', 20)) || 20,
        search: request.input('search') || undefined,
        status: request.input('status') || undefined,
        type: request.input('type') || undefined,
        categoryId: request.input('categoryId') || undefined,
      })
    )
  }

  async show({ params, response }: HttpContext) {
    try {
      const catalog = await this.catalog()
      return response.json(await catalog.find(String(params.id)))
    } catch (e) {
      return this.failed(response, e, 404)
    }
  }

  /**
   * Create a product. Convenience: an inline `price` (minor units) auto-creates
   * a "Default" variant so one call yields a sellable product — a product with
   * no variant has no price and never shows one. `stock` seeds that variant's
   * on-hand quantity; omit it and the variant sells as untracked (always
   * available) rather than out-of-stock.
   */
  async store({ request, response, auth }: HttpContext) {
    try {
      const { createProductValidator } = await this.validators()
      const payload = await request.validateUsing(createProductValidator)

      // Parse + validate the inline-variant convenience args (`price`, `stock`)
      // BEFORE creating the product, so a bad value returns 422 without leaving
      // an orphan product behind — create() and createVariant() are two separate
      // service transactions. (A createVariant failure after a valid price is a
      // rare DB error; it would leave a draft product with no variant — harmless:
      // invisible on the storefront, fixable with add_variant.)
      const rawPrice = request.input('price')
      const wantsVariant = rawPrice !== undefined && rawPrice !== null && rawPrice !== ''
      let priceAmount = 0
      let stockOnHand = 0
      let stockSupplied = false
      if (wantsVariant) {
        priceAmount = Number(rawPrice)
        if (!Number.isSafeInteger(priceAmount) || priceAmount < 0) {
          return response.status(422).json({
            message:
              '`price` must be a non-negative whole number of minor units (e.g. 4900 = $49.00).',
          })
        }
        const rawStock = request.input('stock')
        stockSupplied = rawStock !== undefined && rawStock !== null && rawStock !== ''
        if (stockSupplied) {
          stockOnHand = Number(rawStock)
          if (!Number.isSafeInteger(stockOnHand) || stockOnHand < 0) {
            return response
              .status(422)
              .json({ message: '`stock` must be a non-negative whole number.' })
          }
        }
      }

      const catalog = await this.catalog()
      const product = await catalog.create(payload, (auth.user as User).id)

      if (wantsVariant) {
        await catalog.createVariant(product.id, {
          title: 'Default',
          priceAmount,
          stockOnHand,
          // No stock given → sell as untracked (always available). Otherwise a
          // price-only product would be created out-of-stock (0 tracked, no
          // backorder) and be unpurchasable — contradicting the "sellable"
          // convenience the tool advertises.
          trackInventory: stockSupplied,
        })
        // Re-read so the response carries the variant + resolved price-from.
        return response.status(201).json(await catalog.find(product.id))
      }

      return response.status(201).json(product)
    } catch (e) {
      return this.failed(response, e)
    }
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const { updateProductValidator } = await this.validators()
      const payload = await request.validateUsing(updateProductValidator)
      const catalog = await this.catalog()
      return response.json(await catalog.update(String(params.id), payload))
    } catch (e) {
      return this.failed(response, e)
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      const catalog = await this.catalog()
      await catalog.remove(String(params.id))
      return response.json({ success: true })
    } catch (e) {
      return this.failed(response, e)
    }
  }

  // ── Variants ─────────────────────────────────────────────────────────────

  async storeVariant({ params, request, response }: HttpContext) {
    try {
      const { createVariantValidator } = await this.validators()
      const payload = await request.validateUsing(createVariantValidator)
      const catalog = await this.catalog()
      return response.status(201).json(await catalog.createVariant(String(params.id), payload))
    } catch (e) {
      return this.failed(response, e)
    }
  }

  async updateVariant({ params, request, response }: HttpContext) {
    try {
      const { updateVariantValidator } = await this.validators()
      const payload = await request.validateUsing(updateVariantValidator)
      const catalog = await this.catalog()
      return response.json(await catalog.updateVariant(String(params.variantId), payload))
    } catch (e) {
      return this.failed(response, e)
    }
  }

  async destroyVariant({ params, response }: HttpContext) {
    try {
      const catalog = await this.catalog()
      await catalog.removeVariant(String(params.variantId))
      return response.json({ success: true })
    } catch (e) {
      return this.failed(response, e)
    }
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  async indexCategories({ response }: HttpContext) {
    const catalog = await this.catalog()
    return response.json(await catalog.listCategories())
  }

  async storeCategory({ request, response }: HttpContext) {
    try {
      const { createCategoryValidator } = await this.validators()
      const payload = await request.validateUsing(createCategoryValidator)
      const catalog = await this.catalog()
      return response.status(201).json(await catalog.createCategory(payload))
    } catch (e) {
      return this.failed(response, e)
    }
  }

  async updateCategory({ params, request, response }: HttpContext) {
    try {
      const { updateCategoryValidator } = await this.validators()
      const payload = await request.validateUsing(updateCategoryValidator)
      const catalog = await this.catalog()
      return response.json(await catalog.updateCategory(String(params.id), payload))
    } catch (e) {
      return this.failed(response, e)
    }
  }

  async destroyCategory({ params, response }: HttpContext) {
    try {
      const catalog = await this.catalog()
      await catalog.removeCategory(String(params.id))
      return response.json({ success: true })
    } catch (e) {
      return this.failed(response, e)
    }
  }
}
