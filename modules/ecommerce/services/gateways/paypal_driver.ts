import axios from 'axios'
import type { AxiosInstance } from 'axios'
import type { GatewayMode } from '#modules/ecommerce/models/gateway_credential'
import type { ResolvedGatewayCredentials } from '#modules/ecommerce/services/gateway_credentials_service'
import { Money } from '#modules/ecommerce/services/money'
import {
  WebhookVerificationError,
  type CreateCheckoutInput,
  type CreateCheckoutResult,
  type GatewayPaymentStatus,
  type PaymentGatewayDriver,
  type RefundInput,
  type RefundResult,
  type VerifiedWebhookEvent,
} from '#modules/ecommerce/services/gateways/types'

const BASE_URL = {
  test: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
} as const

/**
 * PayPal Orders v2, hosted approval flow.
 *
 * No SDK: PayPal's Node library is a thin REST wrapper, and webhook
 * verification is itself an API call, so going direct removes a dependency
 * without removing any behaviour.
 *
 * Credential mapping, which differs from Stripe's:
 *   `publicKey`     → client id
 *   `secretKey`     → client secret
 *   `webhookSecret` → **webhook id** (PayPal has no signing secret; verification
 *                     is a call to their API quoting this id)
 */
export default class PayPalDriver implements PaymentGatewayDriver {
  readonly name = 'paypal' as const
  readonly mode: GatewayMode

  private http: AxiosInstance
  private clientId: string
  private clientSecret: string
  private webhookId: string | null

  /** Access tokens last hours; cached to avoid a token call per request. */
  private token: { value: string; expiresAt: number } | null = null

  constructor(credentials: ResolvedGatewayCredentials) {
    this.mode = credentials.mode
    this.clientId = credentials.publicKey ?? ''
    this.clientSecret = credentials.secretKey
    this.webhookId = credentials.webhookSecret

    this.http = axios.create({
      baseURL: BASE_URL[credentials.mode],
      timeout: 20_000,
    })
  }

  private async accessToken(): Promise<string> {
    // 60s of slack so a token cannot expire mid-request.
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value

    if (!this.clientId) {
      throw new Error('PayPal client id is missing. Set it as the public key.')
    }

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    const { data } = await this.http.post(
      '/v1/oauth2/token',
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    this.token = {
      value: data.access_token,
      expiresAt: Date.now() + Number(data.expires_in ?? 3_600) * 1_000,
    }
    return this.token.value
  }

  private async authed<T>(
    method: 'get' | 'post',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const token = await this.accessToken()
    const { data } = await this.http.request<T>({
      method,
      url,
      data: body,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers,
      },
    })
    return data
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const currency = input.currency.toUpperCase()
    const toMajor = (minor: number) => Money.toMajor(minor, currency)

    /**
     * PayPal wants decimal strings, so this is the one boundary where amounts
     * leave integer form. `Money.toMajor` does that conversion by string
     * manipulation rather than division, so no float ever exists.
     *
     * The breakdown must add up to `amount.value` exactly or PayPal rejects the
     * order — which is a useful free check that our own arithmetic balances.
     */
    const items = input.lines.map((line) => ({
      name: line.name.slice(0, 127),
      quantity: String(line.quantity),
      unit_amount: { currency_code: currency, value: toMajor(line.unitAmount) },
      ...(line.description ? { description: line.description.slice(0, 127) } : {}),
    }))

    const itemTotal = input.lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0)

    const order = await this.authed<{
      id: string
      links: { rel: string; href: string }[]
    }>('post', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.orderId,
          custom_id: input.orderId,
          invoice_id: input.orderNumber,
          amount: {
            currency_code: currency,
            value: toMajor(input.totalAmount),
            breakdown: {
              item_total: { currency_code: currency, value: toMajor(itemTotal) },
              shipping: { currency_code: currency, value: toMajor(input.shippingAmount) },
              tax_total: { currency_code: currency, value: toMajor(input.taxAmount) },
              discount: { currency_code: currency, value: toMajor(input.discountAmount) },
            },
          },
          items,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: 'PAY_NOW',
            return_url: input.successUrl,
            cancel_url: input.cancelUrl,
            shipping_preference: 'NO_SHIPPING',
          },
        },
      },
    })

    const approveUrl = order.links?.find(
      (l) => l.rel === 'payer-action' || l.rel === 'approve'
    )?.href
    if (!approveUrl) {
      throw new Error('PayPal did not return an approval URL')
    }

    return { gatewayPaymentId: order.id, redirectUrl: approveUrl }
  }

  /**
   * Read the order, capturing it if the buyer has approved but the funds have
   * not been taken.
   *
   * PayPal's flow needs an explicit capture after approval — unlike Stripe,
   * where the hosted page charges on its own. Capture is idempotent on their
   * side for an already-captured order, so the return page and the webhook can
   * both call this without double-charging.
   */
  async fetchPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentStatus> {
    const order = await this.authed<PayPalOrder>('get', `/v2/checkout/orders/${gatewayPaymentId}`)

    if (order.status === 'APPROVED') {
      try {
        const captured = await this.authed<PayPalOrder>(
          'post',
          `/v2/checkout/orders/${gatewayPaymentId}/capture`,
          {}
        )
        return this.toStatus(captured)
      } catch (error) {
        // `ORDER_ALREADY_CAPTURED` means someone else got there first — read
        // back rather than treating a race as a failure.
        const detail = (error as { response?: { data?: { details?: { issue?: string }[] } } })
          ?.response?.data?.details?.[0]?.issue
        if (detail !== 'ORDER_ALREADY_CAPTURED') throw error

        const reread = await this.authed<PayPalOrder>(
          'get',
          `/v2/checkout/orders/${gatewayPaymentId}`
        )
        return this.toStatus(reread)
      }
    }

    return this.toStatus(order)
  }

  /**
   * Verify a webhook by asking PayPal.
   *
   * PayPal signs with a rotating certificate rather than a shared secret, so
   * offline verification means fetching and caching their cert chain and
   * validating against it. Their verification endpoint is one round trip and
   * cannot drift out of date, which is the better trade for a low-volume path.
   *
   * The raw body is still required: `transmission_sig` covers the exact bytes,
   * so a re-serialised copy would not verify.
   */
  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>
  ): Promise<VerifiedWebhookEvent> {
    if (!this.webhookId) {
      throw new WebhookVerificationError('No PayPal webhook id is configured.')
    }

    const required = [
      'paypal-auth-algo',
      'paypal-cert-url',
      'paypal-transmission-id',
      'paypal-transmission-sig',
      'paypal-transmission-time',
    ] as const

    for (const header of required) {
      if (!headers[header]) {
        throw new WebhookVerificationError(`Missing ${header} header.`)
      }
    }

    let event: Record<string, unknown>
    try {
      event = JSON.parse(rawBody)
    } catch {
      throw new WebhookVerificationError('Webhook body is not valid JSON.')
    }

    let result: { verification_status?: string }
    try {
      result = await this.authed('post', '/v1/notifications/verify-webhook-signature', {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: this.webhookId,
        // PayPal re-serialises this to compare, which is why their own docs
        // require the parsed object here rather than the raw string.
        webhook_event: event,
      })
    } catch (error) {
      // A failed verification call is not a verified webhook. Fail closed.
      throw new WebhookVerificationError(
        `PayPal signature verification call failed: ${(error as Error).message}`
      )
    }

    if (result.verification_status !== 'SUCCESS') {
      throw new WebhookVerificationError(
        `PayPal reported verification_status=${result.verification_status ?? 'unknown'}`
      )
    }

    const resource = event.resource as Record<string, unknown> | undefined
    const supplementary = resource?.supplementary_data as
      | { related_ids?: { order_id?: string } }
      | undefined

    return {
      eventId: String(event.id ?? ''),
      eventType: String(event.event_type ?? ''),
      gatewayPaymentId:
        supplementary?.related_ids?.order_id ??
        (typeof resource?.id === 'string' ? resource.id : null),
      payload: event,
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const order = await this.authed<PayPalOrder>(
      'get',
      `/v2/checkout/orders/${input.gatewayPaymentId}`
    )
    const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id

    if (!captureId) {
      throw new Error('This PayPal order has no capture to refund.')
    }

    const currency = input.currency.toUpperCase()
    const refund = await this.authed<{ id: string; status: string }>(
      'post',
      `/v2/payments/captures/${captureId}/refund`,
      {
        amount: { currency_code: currency, value: Money.toMajor(input.amount, currency) },
        ...(input.reason ? { note_to_payer: input.reason.slice(0, 255) } : {}),
      },
      // PayPal deduplicates on this header, so a retry returns the original refund.
      { 'PayPal-Request-Id': input.idempotencyKey }
    )

    return {
      gatewayRefundId: refund.id,
      status:
        refund.status === 'COMPLETED'
          ? 'succeeded'
          : refund.status === 'FAILED'
            ? 'failed'
            : 'pending',
      raw: refund as unknown as Record<string, unknown>,
    }
  }

  async verifyCredentials(): Promise<void> {
    // Obtaining a token proves the client id and secret are both valid.
    await this.accessToken()
  }

  private toStatus(order: PayPalOrder): GatewayPaymentStatus {
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
    const amountValue = capture?.amount?.value ?? order.purchase_units?.[0]?.amount?.value ?? null
    const currency =
      capture?.amount?.currency_code ?? order.purchase_units?.[0]?.amount?.currency_code ?? null

    let status: GatewayPaymentStatus['status'] = 'pending'
    if (order.status === 'COMPLETED' && capture?.status === 'COMPLETED') status = 'paid'
    else if (order.status === 'VOIDED') status = 'cancelled'
    else if (capture?.status === 'DECLINED' || capture?.status === 'FAILED') status = 'failed'

    return {
      gatewayPaymentId: order.id,
      status,
      // Back to integer minor units the moment it re-enters our domain.
      amount: amountValue && currency ? Money.fromMajor(amountValue, currency) : null,
      currency,
      raw: order as unknown as Record<string, unknown>,
    }
  }
}

/** The slice of PayPal's order shape this driver reads. */
interface PayPalOrder {
  id: string
  status?: string
  purchase_units?: {
    amount?: { currency_code?: string; value?: string }
    payments?: {
      captures?: {
        id?: string
        status?: string
        amount?: { currency_code?: string; value?: string }
      }[]
    }
  }[]
}
