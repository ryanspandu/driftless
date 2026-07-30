import crypto from 'node:crypto'
import encryption from '@adonisjs/core/services/encryption'
import env from '#start/env'
import type Order from '#modules/ecommerce/models/order'

/**
 * Purpose tag, so an order token's ciphertext cannot be moved into a column
 * that holds a different kind of secret and be decrypted there.
 */
const ORDER_TOKEN_PURPOSE = 'ecommerce_order_access_token'

export interface MintedToken {
  plain: string
  hash: string
  enc: string
}

/**
 * A guest's key to one order.
 *
 * 32 random bytes. Stored twice: as a hash, which is what every lookup matches
 * against, and encrypted, which is the only way the confirmation email can
 * contain the buyer's own link — that email is sent from `markOrderPaid`, and
 * the webhook that gets there holds no plaintext.
 */
export function mintOrderToken(): MintedToken {
  const plain = crypto.randomBytes(32).toString('base64url')
  return {
    plain,
    hash: hashOrderToken(plain),
    enc: encryption.encrypt(plain, undefined, ORDER_TOKEN_PURPOSE),
  }
}

export function hashOrderToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Recover the plaintext, or `null`.
 *
 * Returns null rather than throwing for two distinct cases that both mean the
 * same thing here: an order created before this column existed, and a token
 * encrypted under a key that is no longer accepted. Neither is a reason to fail
 * a payment — the caller simply sends an email without a link, or none at all.
 */
export function readOrderToken(order: Order): string | null {
  if (!order.accessTokenEnc) return null
  return encryption.decrypt<string>(order.accessTokenEnc, ORDER_TOKEN_PURPOSE)
}

/**
 * The buyer-facing URL for an order.
 *
 * Built from `APP_URL` rather than from a request, because the caller is
 * usually a webhook or a queue worker with no meaningful host of its own — and
 * because a host taken from an incoming request is attacker-controlled, which
 * is exactly how a confirmation email ends up pointing at someone else's site.
 */
export function orderUrl(token: string): string {
  const base = env.get('APP_URL', 'http://localhost:3333').replace(/\/+$/, '')
  return `${base}/shop/order?token=${encodeURIComponent(token)}`
}

/** The buyer-facing URL for one download grant. */
export function downloadUrl(grantId: string, token: string): string {
  const base = env.get('APP_URL', 'http://localhost:3333').replace(/\/+$/, '')
  return `${base}/shop/download/${grantId}?token=${encodeURIComponent(token)}`
}
