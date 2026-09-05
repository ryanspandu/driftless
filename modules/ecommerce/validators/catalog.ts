import vine from '@vinejs/vine'

/**
 * Shared VineJS validators for the e-commerce catalog (products, variants,
 * categories).
 *
 * These live here rather than inside a controller so BOTH the admin controllers
 * (`controllers/admin/products_controller.ts`, `.../categories_controller.ts`)
 * and the MCP builder-API product controller
 * (`modules/mcp/controllers/api/products_controller.ts`, reached via a dynamic
 * import so MCP never statically depends on this module) validate identically.
 * `CatalogService` only validates variant amounts / SKU / stock and the CTA — it
 * does NOT reject an invalid `status`/`type` enum, so these are the single
 * source of truth for enum + bounds safety.
 */

/**
 * Amounts arrive as **integer minor units**, never as a decimal string or a
 * float. The client's `MoneyInput` parses what someone types into an integer
 * before it ever leaves the browser, and the validator refuses anything else.
 */
export const moneyField = () => vine.number().min(0).max(Number.MAX_SAFE_INTEGER).withoutDecimals()

export const optionSchema = vine.object({
  name: vine.string().trim().minLength(1).maxLength(64),
  values: vine.array(vine.string().trim().maxLength(64)).maxLength(50),
})

export const imageSchema = vine.object({
  mediaUrl: vine.string().trim().maxLength(1024),
  alt: vine.string().trim().maxLength(255).nullable().optional(),
})

export const createProductValidator = vine.compile(
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

export const updateProductValidator = vine.compile(
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
    ctaMode: vine.enum(['add_to_cart', 'buy_now', 'external'] as const).optional(),
    externalUrl: vine.string().trim().maxLength(500).nullable().optional(),
    externalLabel: vine.string().trim().maxLength(80).nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
    categoryIds: vine.array(vine.string().trim()).maxLength(20).optional(),
    images: vine.array(imageSchema).maxLength(20).optional(),
  })
)

export const createVariantValidator = vine.compile(
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

export const updateVariantValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255).optional(),
    sku: vine.string().trim().maxLength(96).nullable().optional(),
    priceAmount: moneyField().optional(),
    compareAtAmount: moneyField().nullable().optional(),
    costAmount: moneyField().nullable().optional(),
    weightGrams: vine.number().min(0).withoutDecimals().nullable().optional(),
    optionValues: vine.record(vine.string().trim().maxLength(64)).optional(),
    stockOnHand: vine.number().min(0).withoutDecimals().optional(),
    trackInventory: vine.boolean().optional(),
    allowBackorder: vine.boolean().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)

export const createCategoryValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(160),
    slug: vine.string().trim().maxLength(160).optional(),
    description: vine.string().trim().maxLength(2_000).nullable().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    parentId: vine.string().trim().nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)

export const updateCategoryValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(160).optional(),
    slug: vine.string().trim().maxLength(160).optional(),
    description: vine.string().trim().maxLength(2_000).nullable().optional(),
    imageUrl: vine.string().trim().maxLength(1024).nullable().optional(),
    parentId: vine.string().trim().nullable().optional(),
    position: vine.number().withoutDecimals().optional(),
  })
)
