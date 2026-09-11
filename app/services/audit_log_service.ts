import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import AuditLog from '#models/audit_log'
import type { AuditActorType } from '#models/audit_log'
import type User from '#models/user'
import { newUlid } from '#services/ulid_service'

/**
 * Keys whose values must never reach the audit trail, matched case-insensitively
 * against the key name at any depth.
 *
 * An audit log is read by more people than the tables it describes, kept longer,
 * and often exported. A credential that leaks into it leaks widely, so the
 * filter is a deny-list applied on write rather than a promise made by callers.
 */
const NEVER_LOG = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /_enc$/i,
  /authorization/i,
  /cookie/i,
  /signature/i,
  /card|cvv|cvc|pan/i,
]

const REDACTED = '[redacted]'
const MAX_DEPTH = 6
const MAX_STRING = 2_000

function isSensitiveKey(key: string): boolean {
  return NEVER_LOG.some((pattern) => pattern.test(key))
}

/**
 * Recursively strip sensitive values and bound the size of what gets stored.
 *
 * Depth and string length are capped because `changes` is written from
 * arbitrary payloads (gateway responses, request bodies) and an audit row must
 * not be able to blow up a table or a log shipper.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'

  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (DateTime.isDateTime(value)) return value.toISO()

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitize(item, depth + 1))
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : sanitize(item, depth + 1)
    }
    return out
  }

  return String(value)
}

/**
 * Hash a client address with a keyed digest.
 *
 * Keyed on `APP_KEY` so the hashes are not reversible with a rainbow table of
 * the (tiny) IPv4 space, while still being stable enough to group requests that
 * came from the same source.
 */
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

/** Who performed the action. */
export type AuditActor =
  | { type: 'user'; user: Pick<User, 'id' | 'email'> }
  | { type: 'customer'; id: string; label?: string | null }
  | { type: 'worker'; label?: string | null }
  | { type: 'system'; label?: string | null }

export interface AuditEntry {
  actor: AuditActor
  /** Dotted verb, e.g. `order.refunded`. */
  action: string
  subjectType?: string | null
  subjectId?: string | null
  changes?: Record<string, unknown>
  /** Minor units — set for anything that moves money. */
  amount?: number | null
  currency?: string | null
  /**
   * The request this happened in, when there is one.
   *
   * Passed explicitly because `config/app.ts` sets `useAsyncLocalStorage: false`,
   * so a service cannot reach for the ambient `HttpContext`. Worker-originated
   * entries pass the originating request id through the job payload instead.
   */
  ctx?: HttpContext | null
  requestId?: string | null
}

function actorFields(actor: AuditActor): {
  actorType: AuditActorType
  actorId: string | null
  actorLabel: string | null
} {
  switch (actor.type) {
    case 'user':
      return { actorType: 'user', actorId: String(actor.user.id), actorLabel: actor.user.email }
    case 'customer':
      return { actorType: 'customer', actorId: actor.id, actorLabel: actor.label ?? null }
    case 'worker':
      return { actorType: 'worker', actorId: null, actorLabel: actor.label ?? 'queue-worker' }
    default:
      return { actorType: 'system', actorId: null, actorLabel: actor.label ?? null }
  }
}

export default class AuditLogService {
  /**
   * Write one entry.
   *
   * Never throws: an audit write must not be able to fail the operation it is
   * describing. A refund that succeeded but could not be logged is still a
   * refund that succeeded, and turning it into a 500 would be worse — the
   * caller would likely retry and refund twice. Failures are surfaced on
   * stderr, which is where the process logger already goes.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      const { actorType, actorId, actorLabel } = actorFields(entry.actor)
      const ctx = entry.ctx

      await AuditLog.create({
        id: newUlid(),
        actorType,
        actorId,
        actorLabel,
        action: entry.action,
        subjectType: entry.subjectType ?? null,
        subjectId: entry.subjectId ?? null,
        changes: (sanitize(entry.changes ?? {}) ?? {}) as Record<string, unknown>,
        amount: entry.amount ?? null,
        currency: entry.currency ? entry.currency.toUpperCase() : null,
        ipHash: hashIp(ctx?.request.ip()),
        userAgent: ctx?.request.header('user-agent')?.slice(0, 512) ?? null,
        requestId: entry.requestId ?? ctx?.request.id() ?? null,
        createdAt: DateTime.now(),
      })
    } catch (error) {
      console.error('[audit] failed to record entry', {
        action: entry.action,
        error: (error as Error).message,
      })
    }
  }

  /** Entries for one subject, newest first. */
  async forSubject(subjectType: string, subjectId: string, limit = 100): Promise<AuditLog[]> {
    return AuditLog.query()
      .where('subject_type', subjectType)
      .where('subject_id', subjectId)
      .orderBy('created_at', 'desc')
      .limit(Math.min(Math.max(limit, 1), 500))
  }

  /** Paginated feed for the admin audit screen. */
  async list(options: {
    page?: number
    pageSize?: number
    action?: string
    actorType?: AuditActorType
    subjectType?: string
  }): Promise<{ items: AuditLog[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(options.page ?? 1, 1)
    const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100)

    const query = AuditLog.query()
    if (options.action) query.where('action', options.action)
    if (options.actorType) query.where('actor_type', options.actorType)
    if (options.subjectType) query.where('subject_type', options.subjectType)

    const result = await query.orderBy('created_at', 'desc').paginate(page, pageSize)
    return { items: result.all(), total: result.total, page, pageSize }
  }
}

/** Exported for tests: the sanitiser is the security-relevant part of this file. */
export const __testing = { sanitize, isSensitiveKey }
