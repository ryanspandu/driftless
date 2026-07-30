import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import { publicError } from '#exceptions/public_error'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import ProductVariant from '#modules/ecommerce/models/product_variant'
import DigitalDeliveryService from '#modules/ecommerce/services/digital_delivery_service'

const assetUpdateValidator = vine.compile(
  vine.object({
    filename: vine.string().trim().minLength(1).maxLength(200).optional(),
    /** `0` means unlimited. */
    maxDownloads: vine.number().min(0).max(10_000).withoutDecimals().optional(),
    /** `0` means the link never expires. */
    linkTtlHours: vine.number().min(0).max(8_760).withoutDecimals().optional(),
  })
)

/**
 * Extensions that must never be served back, whatever the buyer named them.
 *
 * Downloads always go out as `attachment` with `nosniff`, so this is a second
 * layer rather than the only one — but a store operator uploading a `.html`
 * "manual" should not be one proxy misconfiguration away from hosting script
 * on their own origin.
 */
const BLOCKED_EXTENSIONS = ['html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'php', 'phtml']

const delivery = new DigitalDeliveryService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/digital')

export default class DigitalController {
  /** Assets attached to every variant of a product. */
  async index({ params, response }: HttpContext) {
    return response.json(await delivery.listForProduct(String(params.productId)))
  }

  /**
   * Upload a file against a variant.
   *
   * The 500 MB ceiling is a deliberate policy choice, not a technical limit:
   * the request holds a worker for the whole upload, and a store selling files
   * larger than this wants object storage with presigned uploads, not this
   * endpoint.
   */
  async store(ctx: HttpContext) {
    const { params, request, response, auth } = ctx

    try {
      const variantId = String(params.variantId)
      const variant = await ProductVariant.find(variantId)
      if (!variant) {
        throw publicError.notFound('Variant not found.', 'variant_not_found')
      }

      const file = request.file('file', { size: '500mb' })
      if (!file) {
        throw publicError.unprocessable('No file was uploaded.', 'file_required')
      }
      if (!file.isValid) {
        throw publicError.unprocessable(
          file.errors[0]?.message ?? 'That file could not be accepted.',
          'file_invalid'
        )
      }

      const extension = (file.extname ?? '').toLowerCase()
      if (BLOCKED_EXTENSIONS.includes(extension)) {
        throw publicError.unprocessable(
          `.${extension} files cannot be sold as downloads — they execute in a browser. Put it in a zip.`,
          'file_type_blocked'
        )
      }

      const asset = await delivery.attach(variantId, file, {
        maxDownloads: Number(request.input('maxDownloads', 0)),
        linkTtlHours: Number(request.input('linkTtlHours', 72)),
      })

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'digital_asset.uploaded',
        subjectType: 'digital_asset',
        subjectId: asset.id,
        // Never the storage path: an audit log is read by more people than the
        // filesystem is.
        changes: { variantId, filename: asset.filename, sizeBytes: asset.sizeBytes },
        ctx,
      })

      return response.status(201).json(asset)
    } catch (error) {
      return fail(response, error)
    }
  }

  async update(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    try {
      const payload = await request.validateUsing(assetUpdateValidator)
      const asset = await delivery.updateAsset(String(params.id), payload)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'digital_asset.updated',
        subjectType: 'digital_asset',
        subjectId: asset.id,
        changes: payload,
        ctx,
      })

      return response.json(asset)
    } catch (error) {
      return fail(response, error)
    }
  }

  async destroy(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await delivery.removeAsset(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'digital_asset.deleted',
        subjectType: 'digital_asset',
        subjectId: id,
        ctx,
      })

      return response.status(204).send('')
    } catch (error) {
      return fail(response, error)
    }
  }

  /** Grants issued by an order, for the admin's order detail view. */
  async grants({ params, response }: HttpContext) {
    return response.json(await delivery.grantsForOrder(String(params.orderId)))
  }

  /**
   * Withdraw a grant.
   *
   * Sits behind `orders:refund` rather than `orders:manage`: revoking a
   * download is taking back something already paid for, which is the same class
   * of decision as moving money.
   */
  async revoke(ctx: HttpContext) {
    const { params, response, auth } = ctx
    try {
      const id = String(params.id)
      await delivery.revoke(id)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'download_grant.revoked',
        subjectType: 'download_grant',
        subjectId: id,
        ctx,
      })

      return response.json({ revoked: true })
    } catch (error) {
      return fail(response, error)
    }
  }
}
