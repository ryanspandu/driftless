import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import Cart from '#modules/ecommerce/models/cart'
import CartItem from '#modules/ecommerce/models/cart_item'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import PricingService, { type PricedOrder } from '#modules/ecommerce/services/pricing_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'
import CurrencyService from '#modules/ecommerce/services/currency_service'
import DiscountService from '#modules/ecommerce/services/discount_service'
import { Money, type MoneyDto } from '#modules/ecommerce/services/money'

/**
 * The cart cookie.
 *
 * Carries a random token, not a cart id. Only its hash is stored, so neither a
 * guessable identifier nor a database read gets someone into another shopper's
 * basket.
 */
export const CART_COOKIE = 'dl_cart'

const CART_DAYS = 30
/** Bounds a single line, so one request cannot reserve a warehouse. */
const MAX_QUANTITY = 99
/** Bounds a whole cart, so cart-flooding cannot balloon a row set. */
const MAX_LINES = 50

const pricing = new PricingService()
const settings = new StoreSettingsService()
const discounts = new DiscountService()

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * What the storefront sees.
 *
 * Built from scratch rather than filtered from the admin DTO: cost price and
 * raw stock counts are absent by construction, not by remembering to strip
 * them. `available` is deliberately coarse — exact stock is a competitor's
 * business intelligence, and "only 3 left" is all a shopper needs.
 */
export interface CartLineDto {
  variantId: string
  productId: string
  slug: string
  title: string
  variantTitle: string
  imageUrl: string | null
  quantity: number
  unit: MoneyDto
  total: MoneyDto
  /** True when the requested quantity is no longer obtainable. */
  unavailable: boolean
}

export interface CartDto {
  lines: CartLineDto[]
  currency: string
  subtotal: MoneyDto
  discount: MoneyDto
  tax: MoneyDto
  total: MoneyDto
  itemCount: number
  digitalOnly: boolean
  email: string | null
  /** The applied coupon code, if one is valid for the current basket. */
  discountCode: string | null
}

export default class CartService {
  /**
   * The cart for this request, creating one if needed.
   *
   * `create: false` is used by read paths so a bot hitting `GET /api/shop/cart`
   * cannot mint a row per request.
   */
  async forRequest(ctx: HttpContext, options: { create?: boolean } = {}): Promise<Cart | null> {
    const token = ctx.request.cookie(CART_COOKIE) as string | undefined

    if (typeof token === 'string' && token) {
      const cart = await Cart.query()
        .where('token_hash', hashToken(token))
        .where('expires_at', '>', DateTime.now().toSQL()!)
        .first()

      if (cart) return cart
    }

    if (!options.create) return null

    const fresh = crypto.randomBytes(32).toString('base64url')

    const cart = await Cart.create({
      id: newUlid(),
      tokenHash: hashToken(fresh),
      /**
       * Fixed at creation from the shopper's chosen currency. A basket is
       * single-currency by construction: mixing listed prices from two
       * currencies into one total would produce a number that means nothing.
       */
      currency: await new CurrencyService().forRequest(ctx),
      expiresAt: DateTime.now().plus({ days: CART_DAYS }),
    })

    ctx.response.cookie(CART_COOKIE, fresh, {
      httpOnly: true,
      secure: app.inProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: CART_DAYS * 24 * 60 * 60,
    })

    return cart
  }

  /** Add to the cart, or bump the quantity if the variant is already in it. */
  async addItem(cart: Cart, variantId: string, quantity: number): Promise<void> {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw publicError.unprocessable(
        `Quantity must be between 1 and ${MAX_QUANTITY}.`,
        'invalid_quantity'
      )
    }

    const variant = await ProductVariant.query()
      .where('id', variantId)
      .whereNull('deleted_at')
      .preload('product')
      .first()

    if (!variant || variant.product?.status !== 'active' || variant.product?.deletedAt) {
      throw publicError.notFound('That item is not available.', 'variant_unavailable')
    }

    /**
     * An external listing is not sold here.
     *
     * Refused in the service, not merely hidden in the UI: the storefront draws
     * a link instead of an add button, but a crafted POST would otherwise put a
     * product the shop cannot fulfil into a basket, and from there into an
     * order it cannot ship.
     */
    if (variant.product.isExternal) {
      throw publicError.unprocessable(
        `${variant.product.title} is sold elsewhere and cannot be added to a basket.`,
        'product_is_external'
      )
    }

    const existing = await CartItem.query()
      .where('cart_id', cart.id)
      .where('variant_id', variantId)
      .first()

    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_QUANTITY)
      await existing.save()
      return
    }

    const lineCount = await CartItem.query().where('cart_id', cart.id).count('* as total').first()
    const lines = Number(
      (lineCount as never as { $extras: { total: string } })?.$extras?.total ?? 0
    )
    if (lines >= MAX_LINES) {
      throw publicError.unprocessable(
        `A basket can hold at most ${MAX_LINES} different items.`,
        'cart_too_large'
      )
    }

    await CartItem.create({
      id: newUlid(),
      cartId: cart.id,
      variantId,
      quantity,
    })
  }

  /** Set an exact quantity; zero removes the line. */
  async setQuantity(cart: Cart, variantId: string, quantity: number): Promise<void> {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      throw publicError.unprocessable(
        `Quantity must be between 0 and ${MAX_QUANTITY}.`,
        'invalid_quantity'
      )
    }

    if (quantity === 0) {
      await this.removeItem(cart, variantId)
      return
    }

    const item = await CartItem.query()
      .where('cart_id', cart.id)
      .where('variant_id', variantId)
      .first()

    if (!item) throw publicError.notFound('That item is not in your basket.', 'line_not_found')

    item.quantity = quantity
    await item.save()
  }

  async removeItem(cart: Cart, variantId: string): Promise<void> {
    await CartItem.query().where('cart_id', cart.id).where('variant_id', variantId).delete()
  }

  async clear(cart: Cart): Promise<void> {
    await CartItem.query().where('cart_id', cart.id).delete()
  }

  /** The lines, in the shape `PricingService` and `CheckoutService` expect. */
  async lines(cart: Cart): Promise<{ variantId: string; quantity: number }[]> {
    const items = await CartItem.query().where('cart_id', cart.id).orderBy('created_at', 'asc')
    return items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))
  }

  /**
   * Price the cart for display.
   *
   * Runs the same `PricingService` the checkout does, so the total a shopper
   * sees is computed the same way as the one they are charged — there is no
   * second, "display-only" arithmetic that could drift.
   *
   * A line that has become unbuyable does not throw here: the basket page has
   * to render *something*, and flagging the line is more useful than an error
   * page. Checkout still refuses.
   */
  async toDto(cart: Cart): Promise<CartDto> {
    const store = await settings.getOrCreate()
    const lines = await this.lines(cart)
    // The cart's own currency, not the store's — see `forRequest`.
    const currency = (cart.currency || store.currency).toUpperCase()

    const empty: CartDto = {
      lines: [],
      currency,
      subtotal: Money.toDto(0, currency, store.locale),
      discount: Money.toDto(0, currency, store.locale),
      tax: Money.toDto(0, currency, store.locale),
      total: Money.toDto(0, currency, store.locale),
      itemCount: 0,
      digitalOnly: false,
      email: cart.email,
      discountCode: null,
    }

    if (lines.length === 0) return empty

    let priced: PricedOrder
    try {
      priced = await pricing.price(lines, { currency })
    } catch {
      /**
       * Something in the basket is no longer sellable. Rather than failing the
       * page, drop the dead lines and price what is left — the shopper sees
       * their basket with the missing item gone.
       */
      const survivors = await this.dropUnavailable(cart, lines, currency)
      if (survivors.length === 0) return empty
      priced = await pricing.price(survivors, { currency })
    }

    // Apply the persisted coupon, if any. A code that has since become invalid
    // (expired, over its limit, basket no longer qualifies) is dropped silently
    // rather than blocking the basket.
    let discountAmount = 0
    let appliedCode: string | null = null
    if (cart.discountCode) {
      try {
        const evaluated = await discounts.validate(cart.discountCode, priced, cart.email)
        discountAmount = evaluated.amount
        appliedCode = evaluated.discount.code
      } catch {
        cart.discountCode = null
        await cart.save()
      }
    }

    const total = Math.max(priced.totalAmount - discountAmount, 0)

    return {
      lines: await this.decorateLines(priced, store.locale),
      currency: priced.currency,
      subtotal: Money.toDto(priced.subtotalAmount, priced.currency, store.locale),
      discount: Money.toDto(discountAmount, priced.currency, store.locale),
      tax: Money.toDto(priced.taxAmount, priced.currency, store.locale),
      total: Money.toDto(total, priced.currency, store.locale),
      itemCount: priced.lines.reduce((sum, line) => sum + line.quantity, 0),
      digitalOnly: priced.digitalOnly,
      email: cart.email,
      discountCode: appliedCode,
    }
  }

  /**
   * Apply a coupon to the basket. Validates it against the current lines first
   * so the shopper gets immediate feedback; the code is re-validated on every
   * `toDto` and at checkout, so a later change can still drop it.
   */
  async setDiscount(cart: Cart, code: string, email?: string | null): Promise<void> {
    const trimmed = code.trim()
    if (!trimmed) {
      cart.discountCode = null
      await cart.save()
      return
    }
    const lines = await this.lines(cart)
    if (lines.length === 0) {
      throw publicError.unprocessable('Add something to your basket first.', 'empty_basket')
    }
    const priced = await pricing.price(lines, { currency: (cart.currency || undefined) as string })
    // Throws a client-safe reason if the code is not usable.
    const evaluated = await discounts.validate(trimmed, priced, email ?? cart.email)
    cart.discountCode = evaluated.discount.code
    await cart.save()
  }

  /** Remove any applied coupon. */
  async clearDiscount(cart: Cart): Promise<void> {
    cart.discountCode = null
    await cart.save()
  }

  /**
   * Switch a basket to another currency.
   *
   * Checked before it is applied, and **refused by name** if anything in the
   * basket is not sold in the new currency. The alternative — switching and
   * silently dropping what cannot be priced — takes items out of someone's
   * basket without telling them, which is the kind of thing a shopper only
   * notices after they have paid.
   */
  async setCurrency(cart: Cart, code: string): Promise<Cart> {
    const currencies = new CurrencyService()
    if (!(await currencies.isEnabled(code))) {
      throw publicError.unprocessable(
        'This shop does not sell in that currency.',
        'currency_unavailable'
      )
    }

    const next = code.trim().toUpperCase()
    if (next === (cart.currency || '').toUpperCase()) return cart

    const lines = await this.lines(cart)
    if (lines.length > 0) {
      // Throws `not_priced_in_currency` naming the item, which is exactly the
      // message the shopper needs.
      await pricing.price(lines, { currency: next })
    }

    cart.currency = next
    await cart.save()
    return cart
  }

  /** Remove lines whose variant or product has gone away. */
  private async dropUnavailable(
    cart: Cart,
    lines: { variantId: string; quantity: number }[],
    currency: string
  ): Promise<{ variantId: string; quantity: number }[]> {
    const survivors: { variantId: string; quantity: number }[] = []

    for (const line of lines) {
      try {
        await pricing.price([line], { currency })
        survivors.push(line)
      } catch {
        await this.removeItem(cart, line.variantId)
      }
    }

    return survivors
  }

  /** Attach slugs and availability, which pricing does not carry. */
  private async decorateLines(priced: PricedOrder, locale: string): Promise<CartLineDto[]> {
    const variants = await ProductVariant.query()
      .whereIn(
        'id',
        priced.lines.map((line) => line.variantId)
      )
      .preload('product')

    const byId = new Map(variants.map((v) => [v.id, v]))

    return priced.lines.map((line) => {
      const variant = byId.get(line.variantId)
      const available = variant?.availableStock ?? 0

      return {
        variantId: line.variantId,
        productId: line.productId,
        slug: variant?.product?.slug ?? '',
        title: line.title,
        variantTitle: line.variantTitle,
        imageUrl: line.imageUrl,
        quantity: line.quantity,
        unit: Money.toDto(line.unitAmount, priced.currency, locale),
        total: Money.toDto(line.totalAmount, priced.currency, locale),
        unavailable: available < line.quantity,
      }
    })
  }
}
