import type { HttpContext } from '@adonisjs/core/http'
import AuditLogService from '#services/audit_log_service'
import type { GatewayName } from '#modules/ecommerce/models/gateway_credential'
import WebhookService from '#modules/ecommerce/services/webhook_service'
import { gatewayDriver } from '#modules/ecommerce/services/gateways/registry'
import { WebhookVerificationError } from '#modules/ecommerce/services/gateways/types'

const webhooks = new WebhookService()
const audit = new AuditLogService()

/**
 * Payment gateway webhook receiver.
 *
 * Unauthenticated by necessity — the gateway has no session — so the signature
 * *is* the authentication. Three things follow from that:
 *
 *  - It is exempt from CSRF (`config/shield.ts` excludes `/api/webhooks/`),
 *    because there is no cookie to protect and the gateway cannot send a token.
 *  - It is throttled, because an unauthenticated endpoint that does database
 *    work is otherwise a free amplifier.
 *  - **Verification never fails open.** A body that does not verify is logged
 *    and rejected with 400, never processed. A signature check that can be
 *    skipped is not a signature check.
 */
export default class WebhooksController {
  async stripe(ctx: HttpContext) {
    return this.handle(ctx, 'stripe')
  }

  async paypal(ctx: HttpContext) {
    return this.handle(ctx, 'paypal')
  }

  private async handle(ctx: HttpContext, gateway: GatewayName) {
    const { request, response } = ctx

    /**
     * The raw body, not the parsed object.
     *
     * The signature covers the exact bytes the gateway sent. Re-serialising the
     * parsed body changes key order and unicode escaping, so verification would
     * fail for perfectly legitimate deliveries — and a check that fails for
     * benign reasons is one somebody eventually disables.
     */
    const rawBody = request.raw()
    if (!rawBody) {
      return response.status(400).json({ message: 'Empty body.' })
    }

    const headers = request.headers() as Record<string, string | undefined>

    let driver: Awaited<ReturnType<typeof gatewayDriver>>
    try {
      driver = await gatewayDriver(gateway)
    } catch {
      /**
       * Credentials missing or unreadable. 503, not 400: the delivery may be
       * perfectly valid, and telling the gateway "bad request" would make it
       * give up. 5xx keeps it retrying while an operator fixes the config.
       */
      return response.status(503).json({ message: 'Gateway not configured.' })
    }

    let event
    try {
      event = await driver.verifyWebhook(rawBody, headers)
    } catch (error) {
      const isVerification = error instanceof WebhookVerificationError

      await audit.record({
        actor: { type: 'system', label: `${gateway} webhook` },
        action: 'webhook.verification_failed',
        subjectType: 'webhook',
        subjectId: gateway,
        changes: {
          reason: isVerification ? (error as Error).message : 'unexpected error',
          // Enough to correlate with the gateway's dashboard without storing
          // an unverified payload.
          bodyBytes: Buffer.byteLength(rawBody, 'utf8'),
        },
        ctx,
      })

      // Deliberately vague to the caller: an attacker probing the endpoint
      // learns nothing about why their forgery was rejected.
      return response.status(400).json({ message: 'Invalid signature.' })
    }

    try {
      const outcome = await webhooks.ingest(gateway, event)

      /**
       * 200 for a duplicate as well as a fresh delivery. The gateway asked
       * "did you get this?" and the honest answer is yes.
       */
      return response.json({ received: true, status: outcome.status })
    } catch (error) {
      /**
       * Processing failed after the event was recorded. 500 makes the gateway
       * retry, and the row is already durable so the reconcile sweep can pick
       * it up regardless. Never echo the error — it is on its way to a log, not
       * to an untrusted caller.
       */
      console.error(`[ecommerce] ${gateway} webhook processing failed`, error)
      return response.status(500).json({ received: true, status: 'retry' })
    }
  }
}
