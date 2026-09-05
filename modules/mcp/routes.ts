import type { HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware } from '#modules/types'
import { mcpThrottle, mcpRpcThrottle, mcpWriteThrottle } from '#modules/mcp/throttles'
import { mcpAudit } from '#modules/mcp/services/mcp_audit'

const McpCtrl = () => import('#modules/mcp/controllers/mcp_controller')
const CatalogCtrl = () => import('#modules/mcp/controllers/api/catalog_controller')
const CollectionsCtrl = () => import('#modules/mcp/controllers/api/collections_controller')
const PagesCtrl = () => import('#modules/mcp/controllers/api/pages_controller')
const TemplatesCtrl = () => import('#modules/mcp/controllers/api/templates_controller')
const SettingsCtrl = () => import('#modules/mcp/controllers/api/settings_controller')
const MediaCtrl = () => import('#modules/mcp/controllers/api/media_controller')
const RpcCtrl = () => import('#modules/mcp/controllers/mcp_rpc_controller')

/**
 * MCP module routes.
 *
 * Two surfaces:
 *
 * 1. A tiny **admin page** (session-authed) at `/admin/mcp` describing setup.
 * 2. The **builder-API** at `/api/mcp/v1/*` — token-authenticated, the product
 *    surface an AI client (via the bundled MCP server) drives to build a whole
 *    site. Controllers are thin wrappers over the existing core services; the
 *    services remain the validation authority.
 *
 * Effective access on every builder-API route is **token ability ∩ RBAC owner**:
 * `tokenAbility` (the `builder:*` scopes) is the token half, `permission` the
 * owner half, exactly like `/api/v1`. Records reuse the existing `/api/v1/cms`
 * routes rather than being duplicated here.
 *
 * Every route carries an explicit `.as()` name namespaced `mcp.*` — Adonis
 * derives route names from the lazy-controller variable, so two modules that
 * both wrote `const Ctrl = …` would otherwise collide.
 */
export function registerRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  const moduleEnabled = middleware.moduleEnabled({ name: 'mcp' })
  // Safe here: registerRoutes runs from the start/routes.ts preload, after boot.
  const throttle = mcpThrottle()
  const rpcThrottle = mcpRpcThrottle()
  const writeThrottle = mcpWriteThrottle()

  // ── Admin page ────────────────────────────────────────────────────────────
  router
    .get('/admin/mcp', [McpCtrl, 'page'])
    .as('mcp.page')
    .use(middleware.auth())
    .use(middleware.pagePermission({ permission: 'mcp:read' }))
    .use(moduleEnabled)

  // Admin JSON: MCP-scoped token management + the builder-API activity log.
  // Session-authed, requires `mcp:manage`.
  router
    .group(() => {
      router.get('/api/admin/mcp/tokens', [McpCtrl, 'tokens']).as('mcp.tokens.index')
      router.post('/api/admin/mcp/tokens', [McpCtrl, 'createToken']).as('mcp.tokens.store')
      router.delete('/api/admin/mcp/tokens/:id', [McpCtrl, 'deleteToken']).as('mcp.tokens.destroy')
      router.get('/api/admin/mcp/audit', [McpCtrl, 'audit']).as('mcp.audit')
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'mcp:manage' }))
    .use(moduleEnabled)

  // ── In-app MCP endpoint (Streamable HTTP) ──────────────────────────────────
  // Remote AI clients connect here directly with a bearer token — no local
  // stdio install. Only requires a valid token + the module being on; each tool
  // forwards to the builder-API below, where the real ability/RBAC guards run.
  router
    .group(() => {
      router.route('/api/mcp/v1/rpc', ['GET', 'POST', 'DELETE'], [RpcCtrl, 'handle']).as('mcp.rpc')
    })
    .use(middleware.auth({ guards: ['api'] }))
    .use(moduleEnabled)
    // Its OWN bucket — NOT the builder-API throttle — so a tool call isn't counted
    // twice (once here, once on the forwarded builder call) against the same budget.
    .use(rpcThrottle)

  // ── Builder-API (token-authenticated) ─────────────────────────────────────
  const read = (ability: string) => middleware.tokenAbility({ ability })

  router
    .group(() => {
      // Discovery — the block catalog an AI reads before composing content.
      router
        .get('/api/mcp/v1/catalog', [CatalogCtrl, 'show'])
        .as('mcp.catalog')
        .use(read('builder:read'))

      // Collections + fields (schema/DDL) — RBAC `cms:manage`.
      router
        .group(() => {
          router
            .get('/api/mcp/v1/collections', [CollectionsCtrl, 'index'])
            .as('mcp.collections.index')
            .use(read('builder:read'))
          // Static path — registered before `:key` so it isn't captured by it.
          router
            .get('/api/mcp/v1/collections/trashed', [CollectionsCtrl, 'trashed'])
            .as('mcp.collections.trashed')
            .use(read('builder:read'))
          router
            .get('/api/mcp/v1/collections/:key', [CollectionsCtrl, 'show'])
            .as('mcp.collections.show')
            .use(read('builder:read'))
          router
            .post('/api/mcp/v1/collections', [CollectionsCtrl, 'store'])
            .as('mcp.collections.store')
            .use(read('builder:collections'))
          router
            .put('/api/mcp/v1/collections/:key', [CollectionsCtrl, 'update'])
            .as('mcp.collections.update')
            .use(read('builder:collections'))
          router
            .delete('/api/mcp/v1/collections/:key', [CollectionsCtrl, 'destroy'])
            .as('mcp.collections.destroy')
            .use(read('builder:collections'))
          router
            .post('/api/mcp/v1/collections/:key/restore', [CollectionsCtrl, 'restore'])
            .as('mcp.collections.restore')
            .use(read('builder:collections'))
          router
            .delete('/api/mcp/v1/collections/:key/force', [CollectionsCtrl, 'forceDestroy'])
            .as('mcp.collections.force')
            .use(read('builder:collections'))
          router
            .post('/api/mcp/v1/collections/:key/fields', [CollectionsCtrl, 'addField'])
            .as('mcp.collections.fields.add')
            .use(read('builder:collections'))
          router
            .put('/api/mcp/v1/collections/:key/fields/:field', [CollectionsCtrl, 'updateField'])
            .as('mcp.collections.fields.update')
            .use(read('builder:collections'))
          router
            .delete('/api/mcp/v1/collections/:key/fields/:field', [CollectionsCtrl, 'deleteField'])
            .as('mcp.collections.fields.delete')
            .use(read('builder:collections'))
          router
            .patch('/api/mcp/v1/collections/:key/fields/reorder', [
              CollectionsCtrl,
              'reorderFields',
            ])
            .as('mcp.collections.fields.reorder')
            .use(read('builder:collections'))
        })
        .use(middleware.permission({ permission: 'cms:manage' }))

      // Pages — RBAC resource `page`.
      router
        .group(() => {
          router
            .get('/api/mcp/v1/pages', [PagesCtrl, 'index'])
            .as('mcp.pages.index')
            .use(read('builder:read'))
          router
            .post('/api/mcp/v1/pages/validate', [PagesCtrl, 'validate'])
            .as('mcp.pages.validate')
            .use(read('builder:read'))
          router
            .get('/api/mcp/v1/pages/:id', [PagesCtrl, 'show'])
            .as('mcp.pages.show')
            .use(read('builder:read'))
          router
            .post('/api/mcp/v1/pages', [PagesCtrl, 'store'])
            .as('mcp.pages.store')
            .use(read('builder:pages'))
          router
            .put('/api/mcp/v1/pages/:id', [PagesCtrl, 'update'])
            .as('mcp.pages.update')
            .use(read('builder:pages'))
          router
            .put('/api/mcp/v1/pages/:id/content', [PagesCtrl, 'setContent'])
            .as('mcp.pages.content')
            .use(read('builder:pages'))
          router
            .post('/api/mcp/v1/pages/:id/publish', [PagesCtrl, 'publish'])
            .as('mcp.pages.publish')
            .use(read('builder:pages'))
          router
            .post('/api/mcp/v1/pages/:id/discard-draft', [PagesCtrl, 'discardDraft'])
            .as('mcp.pages.discard')
            .use(read('builder:pages'))
          router
            .delete('/api/mcp/v1/pages/:id', [PagesCtrl, 'destroy'])
            .as('mcp.pages.destroy')
            .use(read('builder:pages'))
        })
        .use(middleware.permission({ resource: 'page' }))

      // Templates — RBAC resource `template`.
      router
        .group(() => {
          router
            .get('/api/mcp/v1/templates', [TemplatesCtrl, 'index'])
            .as('mcp.templates.index')
            .use(read('builder:read'))
          router
            .get('/api/mcp/v1/templates/:id', [TemplatesCtrl, 'show'])
            .as('mcp.templates.show')
            .use(read('builder:read'))
          router
            .post('/api/mcp/v1/templates', [TemplatesCtrl, 'store'])
            .as('mcp.templates.store')
            .use(read('builder:templates'))
          router
            .put('/api/mcp/v1/templates/:id', [TemplatesCtrl, 'update'])
            .as('mcp.templates.update')
            .use(read('builder:templates'))
          router
            .delete('/api/mcp/v1/templates/:id', [TemplatesCtrl, 'destroy'])
            .as('mcp.templates.destroy')
            .use(read('builder:templates'))
          router
            .post('/api/mcp/v1/templates/:id/default', [TemplatesCtrl, 'setDefault'])
            .as('mcp.templates.default')
            .use(read('builder:templates'))
        })
        .use(middleware.permission({ resource: 'template' }))

      // Appearance + site config — RBAC `settings:manage`.
      router
        .group(() => {
          router
            .put('/api/mcp/v1/appearance', [SettingsCtrl, 'setAppearance'])
            .as('mcp.appearance')
            .use(read('builder:settings'))
          router
            .put('/api/mcp/v1/breakpoints', [SettingsCtrl, 'setBreakpoints'])
            .as('mcp.breakpoints')
            .use(read('builder:settings'))
          router
            .put('/api/mcp/v1/global-code', [SettingsCtrl, 'setGlobalCode'])
            .as('mcp.globalcode')
            .use(read('builder:settings'))
        })
        .use(middleware.permission({ permission: 'settings:manage' }))

      // Media — RBAC resource `media`.
      router
        .group(() => {
          router
            .get('/api/mcp/v1/media', [MediaCtrl, 'index'])
            .as('mcp.media.index')
            .use(read('builder:read'))
          router
            .post('/api/mcp/v1/media', [MediaCtrl, 'store'])
            .as('mcp.media.store')
            .use(read('builder:media'))
        })
        .use(middleware.permission({ resource: 'media' }))
    })
    .use(middleware.auth({ guards: ['api'] }))
    .use(moduleEnabled)
    .use(throttle)
    // Stricter budget for mutations only (reads pass through untouched). Placed
    // before the audit so throttled (429) requests don't fill the activity log.
    .use(writeThrottle)
    // Innermost, so it runs after auth (the token is known) and records every
    // call — including 403 denials — that reaches the builder-API. This also
    // captures the in-app RPC's tool calls, which forward to these same routes.
    .use(mcpAudit)
}
