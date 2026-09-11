import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import Account from '#modules/ecommerce/models/account'
import env from '#start/env'

/**
 * Who this shop may send marketing to, and how they stop it.
 *
 * The whole feature hangs on one rule: **a basket reminder is marketing, not a
 * receipt.** Nobody asked for it. Sending it without consent and a working
 * one-click opt-out is how a domain ends up on a blocklist — which then takes
 * the order confirmations down with it, so the cost of getting this wrong is
 * not limited to the marketing.
 */
export default class MarketingConsentService {
  /**
   * True only when the customer opted in and has not opted out.
   *
   * Both conditions, not one: `acceptsMarketing` can be flipped back by an
   * admin editing a profile, and an unsubscribe must survive that.
   */
  mayEmail(customer: Account): boolean {
    if (!customer.acceptsMarketing) return false
    if (customer.unsubscribedAt) return false
    if (customer.status !== 'active') return false
    return Boolean(customer.email)
  }

  /**
   * The customer's opt-out token, minted on first use.
   *
   * Lazy rather than at signup so existing customers get one the moment they
   * are first emailed, with no backfill.
   */
  async unsubscribeToken(customer: Account): Promise<string> {
    if (customer.unsubscribeToken) return customer.unsubscribeToken

    const token = crypto.randomBytes(24).toString('base64url')
    customer.unsubscribeToken = token
    await customer.save()
    return token
  }

  /**
   * The link that goes in the email.
   *
   * Built from `APP_URL`, never from a request — the sender is a queue worker
   * with no meaningful host, and a host taken from a request is
   * attacker-controlled.
   */
  unsubscribeUrl(token: string): string {
    const base = env.get('APP_URL', 'http://localhost:3333').replace(/\/+$/, '')
    return `${base}/shop/unsubscribe?token=${encodeURIComponent(token)}`
  }

  /**
   * Honour an opt-out.
   *
   * Idempotent and **never reports whether the token matched**. A response that
   * distinguished a real token from a fake one would turn this into an oracle
   * for which addresses the shop holds — and there is nothing useful to tell
   * someone who clicked a stale link anyway.
   */
  async unsubscribe(token: string): Promise<void> {
    if (!token || token.length > 128) return

    const customer = await Account.query().where('unsubscribe_token', token).first()
    if (!customer) return

    customer.acceptsMarketing = false
    customer.unsubscribedAt = DateTime.now()
    await customer.save()
  }
}
