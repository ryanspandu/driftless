import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import McpAuditLog from '#modules/mcp/models/mcp_audit_log'
import { newUlid } from '#services/ulid_service'

/**
 * Builder-API audit.
 *
 * `mcpAudit` wraps the builder-API group and records one row per request after
 * the response is decided — method, path, a friendly action label, status,
 * duration and the calling token. It is applied INSIDE the auth guard, so the
 * token is known, and it captures denials (403) too. The write is awaited so no
 * row is lost, but wrapped so an audit failure (e.g. the table not migrated yet)
 * never affects the request it records.
 */
export async function mcpAudit(ctx: HttpContext, next: NextFn) {
  const start = Date.now()
  await next()
  try {
    await writeAudit(ctx, Date.now() - start)
  } catch {
    /* auditing must never break the request */
  }
}

async function writeAudit(ctx: HttpContext, durationMs: number): Promise<void> {
  const user = ctx.auth?.user as { id?: number; currentAccessToken?: AccessToken } | undefined
  const token = user?.currentAccessToken
  const method = ctx.request.method()
  const path = ctx.request.url()

  await McpAuditLog.create({
    id: newUlid(),
    tokenId: token ? String(token.identifier) : null,
    tokenName: token?.name ?? null,
    userId: user?.id ?? null,
    method,
    path,
    action: deriveAction(method, path),
    status: ctx.response.getStatus(),
    durationMs,
    ip: ctx.request.ip(),
  })
}

const VERB: Record<string, string> = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
}

/** A short human label, e.g. "page.publish", "collection.create", "media.upload". */
export function deriveAction(method: string, rawPath: string): string {
  const path = rawPath.replace(/\?.*$/, '')
  const rel = path.replace(/^\/api\/mcp\/v1\/?/, '')
  const segs = rel.split('/').filter(Boolean)
  const verb = VERB[method.toUpperCase()] ?? method.toLowerCase()

  // Named sub-actions first — clearer than the generic verb.
  if (path.endsWith('/publish')) return 'page.publish'
  if (path.endsWith('/content')) return 'page.content'
  if (path.endsWith('/validate')) return 'page.validate'
  if (path.endsWith('/discard-draft')) return 'page.discard-draft'
  if (path.endsWith('/default')) return 'template.default'
  if (path.endsWith('/fields/reorder')) return 'field.reorder'
  if (segs.includes('fields')) return `field.${verb}`

  const resourceMap: Record<string, string> = {
    'catalog': 'catalog',
    'collections': 'collection',
    'pages': 'page',
    'templates': 'template',
    'appearance': 'appearance',
    'breakpoints': 'breakpoints',
    'global-code': 'global-code',
    'media': 'media',
  }
  const resource = resourceMap[segs[0] ?? ''] ?? segs[0] ?? 'mcp'

  // Single-target settings/appearance writes read better without a verb suffix.
  if (['appearance', 'breakpoints', 'global-code'].includes(resource)) return `${resource}.set`
  if (resource === 'media' && method === 'POST') return 'media.upload'
  if (resource === 'catalog') return 'catalog.read'
  return `${resource}.${verb}`
}

export interface McpAuditDto {
  id: string
  tokenId: string | null
  tokenName: string | null
  method: string
  path: string
  action: string
  status: number
  durationMs: number
  ip: string | null
  createdAt: string
}

export async function listAudit(params: {
  page?: number
  pageSize?: number
}): Promise<{ data: McpAuditDto[]; meta: { total: number; page: number; pageSize: number } }> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50))

  const result = await McpAuditLog.query().orderBy('created_at', 'desc').paginate(page, pageSize)

  return {
    data: result.all().map((row) => ({
      id: row.id,
      tokenId: row.tokenId,
      tokenName: row.tokenName,
      method: row.method,
      path: row.path,
      action: row.action,
      status: row.status,
      durationMs: row.durationMs,
      ip: row.ip,
      createdAt: row.createdAt.toISO() ?? '',
    })),
    meta: { total: result.total, page, pageSize },
  }
}
