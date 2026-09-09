import type { HttpContext } from '@adonisjs/core/http'
import Page from '#models/page'

/**
 * Builder-API surface for assigning a builder page to a storefront screen — the
 * e-commerce equivalent of the core "use as page" roles (shop front, product,
 * cart/checkout/account, and the category/tag archives).
 *
 * MCP is a module and must never statically import another module, so the
 * ecommerce store settings are reached only through a guarded dynamic import
 * (mirroring `products_controller`). The routes carry `moduleEnabled`, so with
 * the store off the request 404s before this code runs.
 */

/** slot name (what an AI passes) -> StoreSettingsDto page-id field. */
const SLOT_FIELDS = {
  shop: 'shopPageId',
  product: 'productPageId',
  cart: 'cartPageId',
  checkout: 'checkoutPageId',
  order: 'orderPageId',
  account: 'accountPageId',
  login: 'loginPageId',
  register: 'registerPageId',
  category: 'categoryPageId',
  tag: 'tagPageId',
} as const

type Slot = keyof typeof SLOT_FIELDS
const SLOTS = Object.keys(SLOT_FIELDS) as Slot[]

export default class BuilderEcommerceSettingsController {
  private async storeSettings() {
    const { default: StoreSettingsService } =
      await import('#modules/ecommerce/services/settings_service')
    return new StoreSettingsService()
  }

  /**
   * Assign a builder page to a storefront screen. `pageId: ""` clears the slot
   * back to the built-in screen. Rejects a non-PUBLISHED / non-BUILDER page,
   * since the storefront resolver silently ignores anything else.
   */
  async setStorefrontPage({ request, response }: HttpContext) {
    const slot = String(request.input('slot', '')) as Slot
    // Bodyparser converts an empty string to null; coalesce → '' = clear the slot.
    const pageId = String(request.input('pageId') ?? '').trim()
    const field = SLOT_FIELDS[slot]
    if (!field) {
      return response.status(422).json({
        message: `Unknown slot "${slot}". Valid slots: ${SLOTS.join(', ')}.`,
      })
    }
    if (pageId) {
      const page = await Page.query().where('id', pageId).whereNull('deleted_at').first()
      if (!page) return response.status(404).json({ message: `Page "${pageId}" not found.` })
      if (page.status !== 'PUBLISHED' || page.kind !== 'BUILDER') {
        return response.status(422).json({
          message:
            'A storefront page needs a PUBLISHED builder page (drafts/code pages are ignored).',
        })
      }
    }
    try {
      const settings = await this.storeSettings()
      const dto = await settings.update({ [field]: pageId || null })
      return response.json({
        slot,
        field,
        pageId: (dto as unknown as Record<string, unknown>)[field] ?? null,
      })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
