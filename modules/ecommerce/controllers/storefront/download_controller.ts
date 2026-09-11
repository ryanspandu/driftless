import type { HttpContext } from '@adonisjs/core/http'
import { apiFail } from '#helpers/api_error_response'
import DigitalDeliveryService from '#modules/ecommerce/services/digital_delivery_service'

const delivery = new DigitalDeliveryService()

export default class DownloadController {
  /**
   * `GET /shop/download/:id?token=…` — hand over a purchased file.
   *
   * Unauthenticated by design: the order's access token is the credential. It
   * reaches the buyer by email and is what their order page already runs on, so
   * requiring an account here would shut out every guest checkout. What makes
   * that safe is that the token is 32 random bytes stored as a hash, and that
   * each grant is separately counted, expirable and revocable — a leaked link
   * is a bounded loss, not a permanent one.
   */
  async show(ctx: HttpContext) {
    const { params, request, response } = ctx

    try {
      const file = await delivery.redeem(
        String(params.id ?? ''),
        String(request.input('token', '')),
        ctx
      )

      /**
       * `attachment` rather than `inline`: a file the store did not author must
       * never be rendered in the shop's own origin. An HTML or SVG "asset"
       * displayed inline would execute with access to the site's cookies.
       */
      response.header('Content-Type', file.mimeType)
      response.header('Content-Length', String(file.sizeBytes))
      response.header('Content-Disposition', `attachment; filename="${file.filename}"`)
      // Belt and braces if a proxy ever ignores the disposition.
      response.header('X-Content-Type-Options', 'nosniff')
      // A download link is per-buyer and quota-limited; nothing may cache it.
      response.header('Cache-Control', 'private, no-store')

      return response.stream(file.stream)
    } catch (error) {
      return apiFail(response, error, 'ecommerce/download')
    }
  }
}
