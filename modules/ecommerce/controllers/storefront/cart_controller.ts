import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import CartService from '#modules/ecommerce/services/cart_service'

const addValidator = vine.compile(
  vine.object({
    variantId: vine.string().trim().minLength(1).maxLength(40),
    quantity: vine.number().min(1).max(99).withoutDecimals().optional(),
  })
)

const setValidator = vine.compile(
  vine.object({
    variantId: vine.string().trim().minLength(1).maxLength(40),
    quantity: vine.number().min(0).max(99).withoutDecimals(),
  })
)

const discountValidator = vine.compile(vine.object({ code: vine.string().trim().maxLength(64) }))

const carts = new CartService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/cart')

/**
 * The basket.
 *
 * Note what the request body never contains: a price. A cart records what and
 * how many; every amount is recomputed from the database. There is no stored
 * figure for a tampered request to influence.
 */
export default class CartController {
  /**
   * Read the basket.
   *
   * Does not create one — otherwise a crawler hitting this endpoint would mint
   * a row and set a cookie on every request.
   */
  async show(ctx: HttpContext) {
    const { response } = ctx
    const cart = await carts.forRequest(ctx)

    if (!cart) {
      const empty = await carts.forRequest(ctx, { create: true })
      return response.json(await carts.toDto(empty!))
    }

    return response.json(await carts.toDto(cart))
  }

  async add(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { variantId, quantity } = await request.validateUsing(addValidator)
      const cart = await carts.forRequest(ctx, { create: true })
      await carts.addItem(cart!, variantId, quantity ?? 1)
      return response.json(await carts.toDto(cart!))
    } catch (error) {
      return fail(response, error)
    }
  }

  async update(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { variantId, quantity } = await request.validateUsing(setValidator)
      const cart = await carts.forRequest(ctx)
      if (!cart) return response.status(404).json({ message: 'No basket.', reason: 'no_cart' })

      await carts.setQuantity(cart, variantId, quantity)
      return response.json(await carts.toDto(cart))
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroy(ctx: HttpContext) {
    const { params, response } = ctx
    const cart = await carts.forRequest(ctx)
    if (!cart) return response.status(404).json({ message: 'No basket.', reason: 'no_cart' })

    await carts.removeItem(cart, String(params.variantId))
    return response.json(await carts.toDto(cart))
  }

  async clear(ctx: HttpContext) {
    const { response } = ctx
    const cart = await carts.forRequest(ctx)
    if (!cart) return response.status(404).json({ message: 'No basket.', reason: 'no_cart' })

    await carts.clear(cart)
    return response.json(await carts.toDto(cart))
  }

  /** Apply a coupon code to the basket. */
  async applyDiscount(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const { code } = await request.validateUsing(discountValidator)
      const cart = await carts.forRequest(ctx)
      if (!cart) return response.status(404).json({ message: 'No basket.', reason: 'no_cart' })

      await carts.setDiscount(cart, code)
      return response.json(await carts.toDto(cart))
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Remove the applied coupon. */
  async removeDiscount(ctx: HttpContext) {
    const { response } = ctx
    const cart = await carts.forRequest(ctx)
    if (!cart) return response.status(404).json({ message: 'No basket.', reason: 'no_cart' })

    await carts.clearDiscount(cart)
    return response.json(await carts.toDto(cart))
  }
}
