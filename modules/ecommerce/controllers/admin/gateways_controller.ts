import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { apiFail } from '#helpers/api_error_response'
import AuditLogService from '#services/audit_log_service'
import type User from '#models/user'
import GatewayCredentialsService from '#modules/ecommerce/services/gateway_credentials_service'
import { gatewayDriver } from '#modules/ecommerce/services/gateways/registry'

const updateValidator = vine.compile(
  vine.object({
    enabled: vine.boolean().optional(),
    publicKey: vine.string().trim().maxLength(512).nullable().optional(),
    /**
     * Omit to keep the stored secret; empty string clears it. The admin UI only
     * sends these when someone types a new value, so toggling "enabled" cannot
     * silently wipe an API key.
     */
    secretKey: vine.string().maxLength(512).nullable().optional(),
    webhookSecret: vine.string().maxLength(512).nullable().optional(),
  })
)

const credentials = new GatewayCredentialsService()
const audit = new AuditLogService()

const fail = (response: HttpContext['response'], error: unknown) =>
  apiFail(response, error, 'ecommerce/gateways')

function parseTarget(params: Record<string, unknown>) {
  const gateway = String(params.gateway)
  const mode = String(params.mode)

  if (gateway !== 'stripe' && gateway !== 'paypal') return null
  if (mode !== 'test' && mode !== 'live') return null

  return { gateway, mode } as const
}

export default class GatewaysController {
  async index({ response }: HttpContext) {
    return response.json(await credentials.list())
  }

  async update(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    const target = parseTarget(params)
    if (!target) {
      return response
        .status(422)
        .json({ message: 'Unknown gateway or mode.', reason: 'unknown_gateway' })
    }

    try {
      const payload = await request.validateUsing(updateValidator)
      const dto = await credentials.update(target.gateway, target.mode, payload)

      /**
       * The audit records *that* keys changed, never what they are. The sanitiser
       * would redact them anyway, but the DTO does not carry them in the first
       * place.
       */
      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'gateway.credentials_updated',
        subjectType: 'gateway_credential',
        subjectId: `${target.gateway}:${target.mode}`,
        changes: {
          enabled: dto.enabled,
          secretKeyChanged: payload.secretKey !== undefined,
          webhookSecretChanged: payload.webhookSecret !== undefined,
        },
        ctx,
      })

      return response.json(dto)
    } catch (error) {
      return fail(response, error)
    }
  }

  /**
   * Check the stored credentials actually work.
   *
   * Synchronous on purpose: the operator is waiting to find out whether their
   * keys are right, so a queued check that reported "accepted" would be useless.
   */
  async verify(ctx: HttpContext) {
    const { params, response, auth } = ctx
    const target = parseTarget(params)
    if (!target) {
      return response
        .status(422)
        .json({ message: 'Unknown gateway or mode.', reason: 'unknown_gateway' })
    }

    try {
      const driver = await gatewayDriver(target.gateway)
      await driver.verifyCredentials()
      await credentials.recordVerification(target.gateway, target.mode, true)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'gateway.verified',
        subjectType: 'gateway_credential',
        subjectId: `${target.gateway}:${target.mode}`,
        ctx,
      })

      return response.json({ ok: true })
    } catch (error) {
      /**
       * Gateway errors are safe to show and genuinely useful here ("Invalid API
       * Key provided", "connect ETIMEDOUT"): the reader is an admin diagnosing
       * their own account, and the message carries no secret. This is the
       * deliberate exception to not echoing raw errors.
       */
      const message = (error as Error).message ?? 'Verification failed'
      await credentials.recordVerification(target.gateway, target.mode, false, message)
      return response
        .status(422)
        .json({ ok: false, message, reason: 'gateway_verification_failed' })
    }
  }
}
