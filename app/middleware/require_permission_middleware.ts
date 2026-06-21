import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { abilityAllowsCode, collectUserPermissions } from '#services/permission_ability_service'

type CmsVerb = 'read' | 'create' | 'update' | 'delete'

type PermissionOptions =
  | { permission: string }
  | { cmsRecord: true }
  | { resource: 'content' | 'user' | 'media' | 'page' | 'template' }

function verbForMethod(method: string): CmsVerb {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return 'read'
  }
}

function resolveRequiredPermission(ctx: HttpContext, options: PermissionOptions): string | null {
  if ('permission' in options) {
    return options.permission
  }

  if ('cmsRecord' in options) {
    const key = ctx.params.key
    if (!key) return null
    return `cms:${key}:${verbForMethod(ctx.request.method())}`
  }

  const verb = verbForMethod(ctx.request.method())

  if (options.resource === 'user') {
    return verb === 'read' ? 'user:read' : 'user:manage'
  }

  if (options.resource === 'content') {
    return `content:${verb}`
  }

  if (options.resource === 'page') {
    return `page:${verb}`
  }

  if (options.resource === 'template') {
    return `template:${verb}`
  }

  if (options.resource === 'media') {
    return verb === 'read' ? 'media:read' : 'media:manage'
  }

  return null
}

export default class RequirePermissionMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: PermissionOptions) {
    const user = ctx.auth.user
    if (!user) {
      return ctx.response.status(401).json({ message: 'Unauthorized' })
    }

    await user.load('roles', (q) => q.preload('permissions'))
    const permissions = collectUserPermissions(user)
    const required = resolveRequiredPermission(ctx, options)

    if (!required || !abilityAllowsCode(permissions, required)) {
      return ctx.response.status(403).json({ message: 'Forbidden' })
    }

    return next()
  }
}
