import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'

/**
 * Idempotency for client-initiated writes — checkout above all.
 *
 * A checkout POST that times out client-side gets retried. Without this, the
 * retry creates a second order and, once paid, a second charge. The stored
 * response means a retry sees exactly what the first call returned.
 *
 * Three states matter:
 *
 *  - **No record** → this is the first attempt; claim the key and proceed.
 *  - **`in_flight`** → an identical request is running right now. Answering
 *    would mean doing the work twice concurrently, so this is a 409.
 *  - **`done`** → replay the stored response verbatim.
 *
 * A key reused with a *different* body is a client bug, not a retry, and is
 * rejected rather than answered with someone else's response.
 */

const TTL_HOURS = 24

export interface IdempotencyClaim {
  /** Null when this is a fresh claim and the caller should do the work. */
  replay: { status: number; body: unknown } | null
  /** Call after the work succeeds so a retry can replay it. */
  complete: (status: number, body: unknown) => Promise<void>
  /** Call on failure so the caller may legitimately retry. */
  release: () => Promise<void>
}

function hashBody(body: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex')
}

/**
 * Scope a key to whoever supplied it.
 *
 * Without this, one caller could guess another's key and read back their
 * response — which for checkout means someone else's order, complete with
 * their address.
 */
export function actorFingerprint(parts: (string | null | undefined)[]): string {
  return crypto
    .createHash('sha256')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 64)
}

export default class IdempotencyService {
  async claim(key: string, actor: string, body: unknown): Promise<IdempotencyClaim> {
    const requestHash = hashBody(body)
    const now = DateTime.now()
    const expiresAt = now.plus({ hours: TTL_HOURS })

    const existing = await db
      .from('ecommerce_idempotency_keys')
      .where('key', key)
      .where('actor_fingerprint', actor)
      .first()

    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw publicError.unprocessable(
          'This idempotency key was already used with a different request.',
          'idempotency_key_reuse'
        )
      }

      if (existing.status === 'in_flight') {
        throw publicError.conflict(
          'An identical request is still being processed. Try again in a moment.',
          'idempotency_in_flight'
        )
      }

      return {
        replay: {
          status: Number(existing.response_status ?? 200),
          body:
            typeof existing.response_body === 'string'
              ? JSON.parse(existing.response_body)
              : (existing.response_body ?? null),
        },
        complete: async () => {},
        release: async () => {},
      }
    }

    /**
     * Claim the key with an INSERT and let the unique index arbitrate. Two
     * concurrent first-attempts both reach here; exactly one insert succeeds
     * and the loser is told a request is in flight — which is the truth.
     */
    try {
      await db.table('ecommerce_idempotency_keys').insert({
        id: newUlid(),
        key,
        actor_fingerprint: actor,
        request_hash: requestHash,
        status: 'in_flight',
        expires_at: expiresAt.toSQL(),
        created_at: now.toSQL(),
        updated_at: now.toSQL(),
      })
    } catch {
      throw publicError.conflict(
        'An identical request is still being processed. Try again in a moment.',
        'idempotency_in_flight'
      )
    }

    return {
      replay: null,
      complete: async (status, responseBody) => {
        await db
          .from('ecommerce_idempotency_keys')
          .where('key', key)
          .where('actor_fingerprint', actor)
          .update({
            status: 'done',
            response_status: status,
            response_body: JSON.stringify(responseBody ?? null),
            updated_at: DateTime.now().toSQL(),
          })
      },
      release: async () => {
        /**
         * Delete rather than mark failed: the request did not succeed, so the
         * caller is entitled to retry with the same key. Leaving the row would
         * lock them out of their own retry.
         */
        await db
          .from('ecommerce_idempotency_keys')
          .where('key', key)
          .where('actor_fingerprint', actor)
          .where('status', 'in_flight')
          .delete()
      },
    }
  }

  /** Housekeeping: drop expired keys. Safe to run repeatedly. */
  async prune(now: DateTime = DateTime.now()): Promise<number> {
    const deleted = await db
      .from('ecommerce_idempotency_keys')
      .where('expires_at', '<', now.toSQL()!)
      .delete()
    return Number(deleted ?? 0)
  }
}
