import app from '@adonisjs/core/services/app'
import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import {
  apiV1Throttle,
  authIpThrottle,
  loginAccountThrottle,
  moduleInstallThrottle,
  registerThrottle,
} from '#start/limiter'
import { registerAllModuleRoutes } from '#modules/registry'

/**
 * Resolve the adonis-autoswagger singleton across CJS/ESM interop variations.
 * Its published types say the default export is the instance, but under NodeNext
 * the instance can land at `mod.default` or `mod.default.default` — probe for the
 * one that actually has `.docs`.
 */
async function loadAutoSwagger(): Promise<any> {
  const mod: any = await import('adonis-autoswagger')
  const cand = mod.default
  return cand?.docs ? cand : (cand?.default ?? cand)
}

// ── Public ────────────────────────────────────────────────────────────────────

router.get('/', [() => import('#controllers/public_controller'), 'home']).as('home')
router.get('/posts/:slug', [() => import('#controllers/public_controller'), 'post'])
router.get('/offline', [() => import('#controllers/public_controller'), 'offline'])

router.get('/api/public/content', [() => import('#controllers/public_content_controller'), 'index'])
router.get('/api/public/content/:slug', [() => import('#controllers/public_content_controller'), 'show'])

// Public, read-only CMS collection records (consumed by builder CollectionList blocks)
router.get('/api/public/cms/:key/records', [() => import('#controllers/public_cms_controller'), 'records'])
router.get('/api/public/cms/:key/records/:id', [() => import('#controllers/public_cms_controller'), 'record'])

// Public, read-only template content (consumed by client-side TemplateRef blocks)
router.get('/api/public/templates/:id', [() => import('#controllers/public_templates_controller'), 'show'])

router.get('/robots.txt', [() => import('#controllers/seo_controller'), 'robots'])
router.get('/sitemap.xml', [() => import('#controllers/seo_controller'), 'sitemap'])
/**
 * Public probe: a status code and a version, nothing else. 503 when the
 * database is unreachable or the built assets do not match their manifest —
 * the state that used to report healthy while serving blank pages.
 */
router.get('/health', [() => import('#controllers/admin/health_controller'), 'public'])

// ── API docs (dev-only): OpenAPI spec + Scalar UI via adonis-autoswagger ────────
// Not registered in production, so /api/docs and /api/openapi do not exist there.
// The spec is scoped to the JSON API surface (`/api/*`), excluding the doc routes.
if (!app.inProduction) {
  router.get('/api/openapi', async () => {
    const AutoSwagger = await loadAutoSwagger()
    const { default: swagger } = await import('#config/swagger')
    const all: any = router.toJSON()
    const scoped = {
      ...all,
      root: (all.root ?? []).filter(
        (r: any) =>
          String(r.pattern).startsWith('/api/') &&
          r.pattern !== '/api/docs' &&
          r.pattern !== '/api/openapi'
      ),
    }
    return AutoSwagger.docs(scoped, swagger)
  })

  router.get('/api/docs', async () => {
    const AutoSwagger = await loadAutoSwagger()
    return AutoSwagger.scalar('/api/openapi')
  })
}

// ── Auth Config (public) ──────────────────────────────────────────────────────

router.get('/api/auth/config', [() => import('#controllers/admin/settings_controller'), 'getAuthConfig'])

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get('/auth/google/status', [() => import('#controllers/google_auth_controller'), 'status'])
router.get('/auth/google', [() => import('#controllers/google_auth_controller'), 'start']).use(authIpThrottle)
router
  .get('/auth/google/callback', [() => import('#controllers/google_auth_controller'), 'callback'])
  .use(authIpThrottle)

// ── Auth ──────────────────────────────────────────────────────────────────────

router
  .group(() => {
    router.get('/register', [() => import('#controllers/new_account_controller'), 'create']).as('new_account.create')
    // Credential endpoints are throttled per-IP and, for login, per-account.
    // GET routes are left unthrottled: they render a form and cost nothing.
    router
      .post('/register', [() => import('#controllers/new_account_controller'), 'store'])
      .as('new_account.store')
      .use(authIpThrottle)
      .use(registerThrottle)
    router.get('/login', [() => import('#controllers/session_controller'), 'create']).as('session.create')
    router
      .post('/login', [() => import('#controllers/session_controller'), 'store'])
      .as('session.store')
      .use(authIpThrottle)
      .use(loginAccountThrottle)

    // Legacy aliases (explicit names — same controller action must not reuse new_account.store)
    router.get('/signup', ({ response }) => response.redirect('/register'))
    router.post('/signup', [() => import('#controllers/new_account_controller'), 'store'])
      .as('legacy.signup.store')
      .use(authIpThrottle)
      .use(registerThrottle)

    // Inertia page paths use auth/*; keep canonical URLs at /login and /register.
    router.get('/auth/login', ({ response }) => response.redirect('/login'))
    router.get('/auth/signup', ({ response }) => response.redirect('/register'))
    router.get('/auth/register', ({ response }) => response.redirect('/register'))
  })
  .use(middleware.guest())

router
  .group(() => {
    router.post('/logout', [() => import('#controllers/session_controller'), 'destroy']).as('session.destroy')
    router.get('/api/me', [() => import('#controllers/session_controller'), 'me'])
    router.put('/api/me', [() => import('#controllers/session_controller'), 'updateProfile'])
  })
  .use(middleware.auth())

// ── Admin (pages + API) ───────────────────────────────────────────────────────

router
  .group(() => {
    router.get('/admin', ({ response }) => response.redirect('/admin/dashboard'))
    router.get('/admin/dashboard', [() => import('#controllers/admin/dashboard_controller'), 'index'])
    router.get('/admin/analytics', [() => import('#controllers/admin/dashboard_controller'), 'analyticsPage'])
    router.get('/admin/profile', [() => import('#controllers/admin/dashboard_controller'), 'profilePage'])

    // Users
    // Privileged admin *pages* carry `pagePermission` as well as their APIs.
    // Without it any signed-in account can load the React shell for these
    // screens; the APIs behind them still 403, so it is a structural leak
    // rather than data access, but these are the screens where that matters.
    router.get('/admin/users', [() => import('#controllers/admin/users_controller'), 'page'])
      .use(middleware.pagePermission({ permission: 'user:read' }))
    router.get('/api/admin/users/generate-password', [() => import('#controllers/admin/users_controller'), 'generatePassword'])
      .use(middleware.permission({ permission: 'user:manage' }))
    router
      .group(() => {
        router.get('/api/admin/users', [() => import('#controllers/admin/users_controller'), 'index'])
        router.get('/api/admin/users/trash', [() => import('#controllers/admin/users_controller'), 'trash'])
        router.post('/api/admin/users', [() => import('#controllers/admin/users_controller'), 'store'])
        router.post('/api/admin/users/:id/restore', [() => import('#controllers/admin/users_controller'), 'restore'])
        router.delete('/api/admin/users/:id/force', [() => import('#controllers/admin/users_controller'), 'forceDestroy'])
        router.put('/api/admin/users/:id', [() => import('#controllers/admin/users_controller'), 'update'])
        router.delete('/api/admin/users/:id', [() => import('#controllers/admin/users_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'user' }))

    // Roles
    router.get('/admin/roles', [() => import('#controllers/admin/roles_controller'), 'page'])
      .use(middleware.pagePermission({ permission: 'role:manage' }))
    router.get('/admin/roles/new', [() => import('#controllers/admin/roles_controller'), 'newPage'])
      .use(middleware.pagePermission({ permission: 'role:manage' }))
    router.get('/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'detailPage'])
      .use(middleware.pagePermission({ permission: 'role:manage' }))
    router
      .group(() => {
        router.get('/api/admin/roles', [() => import('#controllers/admin/roles_controller'), 'index'])
        router.get('/api/admin/roles/trash', [() => import('#controllers/admin/roles_controller'), 'trash'])
        router.get('/api/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'show'])
        router.post('/api/admin/roles', [() => import('#controllers/admin/roles_controller'), 'store'])
        router.post('/api/admin/roles/:id/restore', [() => import('#controllers/admin/roles_controller'), 'restore'])
        router.delete('/api/admin/roles/:id/force', [() => import('#controllers/admin/roles_controller'), 'forceDestroy'])
        router.put('/api/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'update'])
        router.delete('/api/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'destroy'])
      })
      .use(middleware.permission({ permission: 'role:manage' }))

    // Permissions
    router.get('/admin/permissions', [() => import('#controllers/admin/permissions_controller'), 'page'])
      .use(middleware.pagePermission({ permission: 'permission:manage' }))
    router.get('/admin/permissions/new', [() => import('#controllers/admin/permissions_controller'), 'newPage'])
      .use(middleware.pagePermission({ permission: 'permission:manage' }))
    router.get('/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'detailPage'])
      .use(middleware.pagePermission({ permission: 'permission:manage' }))
    router
      .group(() => {
        router.get('/api/admin/permissions', [() => import('#controllers/admin/permissions_controller'), 'index'])
        router.get('/api/admin/permissions/trash', [() => import('#controllers/admin/permissions_controller'), 'trash'])
        router.get('/api/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'show'])
        router.post('/api/admin/permissions', [() => import('#controllers/admin/permissions_controller'), 'store'])
        router.post('/api/admin/permissions/:id/restore', [() => import('#controllers/admin/permissions_controller'), 'restore'])
        router.delete('/api/admin/permissions/:id/force', [() => import('#controllers/admin/permissions_controller'), 'forceDestroy'])
        router.put('/api/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'update'])
        router.delete('/api/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'destroy'])
      })
      .use(middleware.permission({ permission: 'permission:manage' }))

    // Content
    router.get('/admin/content', [() => import('#controllers/admin/content_controller'), 'page'])
    router.get('/admin/content/new', [() => import('#controllers/admin/content_controller'), 'newPage'])
    router.get('/admin/content/:id/edit', [() => import('#controllers/admin/content_controller'), 'editPage'])
    router
      .group(() => {
        router.get('/api/admin/content', [() => import('#controllers/admin/content_controller'), 'index'])
        router.get('/api/admin/content/trash', [() => import('#controllers/admin/content_controller'), 'trash'])
        router.get('/api/admin/content/check-slug', [() => import('#controllers/admin/content_controller'), 'checkSlug'])
        router.post('/api/admin/content', [() => import('#controllers/admin/content_controller'), 'store'])
        router.post('/api/admin/content/:id/restore', [() => import('#controllers/admin/content_controller'), 'restore'])
        router.delete('/api/admin/content/:id/force', [() => import('#controllers/admin/content_controller'), 'forceDestroy'])
        router.put('/api/admin/content/:id', [() => import('#controllers/admin/content_controller'), 'update'])
        router.delete('/api/admin/content/:id', [() => import('#controllers/admin/content_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'content' }))

    // Pages (visual builder)
    router.get('/admin/pages', [() => import('#controllers/admin/pages_controller'), 'page'])
    router.get('/admin/pages/:id/edit', [() => import('#controllers/admin/pages_controller'), 'edit'])
    // Admin-only preview — renders a page at ANY status (Draft included), uncached.
    router.get('/admin/pages/:id/preview', [() => import('#controllers/pages_public_controller'), 'preview'])
    router
      .group(() => {
        router.get('/api/admin/pages', [() => import('#controllers/admin/pages_controller'), 'index'])
        router.get('/api/admin/pages/trash', [() => import('#controllers/admin/pages_controller'), 'trash'])
        router.get('/api/admin/pages/collections', [() => import('#controllers/admin/pages_controller'), 'collections'])
        router.post('/api/admin/pages', [() => import('#controllers/admin/pages_controller'), 'store'])
        router.post('/api/admin/pages/:id/restore', [() => import('#controllers/admin/pages_controller'), 'restore'])
        router.delete('/api/admin/pages/:id/force', [() => import('#controllers/admin/pages_controller'), 'forceDestroy'])
        router.get('/api/admin/pages/:id/revisions', [() => import('#controllers/admin/pages_controller'), 'revisions'])
        router.post('/api/admin/pages/:id/revisions/:revisionId/restore', [
          () => import('#controllers/admin/pages_controller'),
          'restoreRevision',
        ])
        router.get('/api/admin/pages/:id', [() => import('#controllers/admin/pages_controller'), 'show'])
        router.put('/api/admin/pages/:id', [() => import('#controllers/admin/pages_controller'), 'update'])
        router.delete('/api/admin/pages/:id', [() => import('#controllers/admin/pages_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'page' }))

    // Templates (unified header / footer / component / layout builder)
    router.get('/admin/templates', [() => import('#controllers/admin/templates_controller'), 'page'])
    router.get('/admin/templates/:id/edit', [() => import('#controllers/admin/templates_controller'), 'edit'])
    router
      .group(() => {
        router.get('/api/admin/templates', [() => import('#controllers/admin/templates_controller'), 'index'])
        router.post('/api/admin/templates', [() => import('#controllers/admin/templates_controller'), 'store'])
        router.post('/api/admin/templates/:id/duplicate', [() => import('#controllers/admin/templates_controller'), 'duplicate'])
        router.post('/api/admin/templates/:id/default', [() => import('#controllers/admin/templates_controller'), 'setDefault'])
        router.get('/api/admin/templates/:id', [() => import('#controllers/admin/templates_controller'), 'show'])
        router.put('/api/admin/templates/:id', [() => import('#controllers/admin/templates_controller'), 'update'])
        router.delete('/api/admin/templates/:id', [() => import('#controllers/admin/templates_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'template' }))

    // CMS Collections
    router.get('/admin/cms/collections', [() => import('#controllers/admin/cms_controller'), 'collectionsPage'])
    router.get('/admin/cms/collections/new', [() => import('#controllers/admin/cms_controller'), 'collectionsNewPage'])
    router.get('/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionDetailPage'])
    router
      .group(() => {
        router.get('/api/admin/cms/collections', [() => import('#controllers/admin/cms_controller'), 'collectionsIndex'])
        router.get('/api/admin/cms/collections/trash', [() => import('#controllers/admin/cms_controller'), 'collectionsTrash'])
        router.get('/api/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionsShow'])
        router.post('/api/admin/cms/collections', [() => import('#controllers/admin/cms_controller'), 'collectionsStore'])
        router.post('/api/admin/cms/collections/:key/restore', [() => import('#controllers/admin/cms_controller'), 'collectionsRestore'])
        router.delete('/api/admin/cms/collections/:key/force', [() => import('#controllers/admin/cms_controller'), 'collectionsForceDestroy'])
        router.put('/api/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionsUpdate'])
        router.delete('/api/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionsDestroy'])
        router.post('/api/admin/cms/collections/:key/fields', [() => import('#controllers/admin/cms_controller'), 'fieldsStore'])
        router.put('/api/admin/cms/collections/:key/fields/:fieldKey', [() => import('#controllers/admin/cms_controller'), 'fieldsUpdate'])
        router.patch('/api/admin/cms/collections/:key/fields/reorder', [() => import('#controllers/admin/cms_controller'), 'fieldsReorder'])
        router.delete('/api/admin/cms/collections/:key/fields/:fieldKey', [() => import('#controllers/admin/cms_controller'), 'fieldsDestroy'])
      })
      .use(middleware.permission({ permission: 'cms:manage' }))

    // CMS Components (reusable field groups) — registered before the :key record
    // routes so /admin/cms/components isn't captured as a collection key.
    router.get('/admin/cms/components', [() => import('#controllers/admin/cms_controller'), 'componentsPage'])
    router
      .group(() => {
        router.get('/api/admin/cms/components', [() => import('#controllers/admin/cms_controller'), 'componentsIndex'])
        router.post('/api/admin/cms/components', [() => import('#controllers/admin/cms_controller'), 'componentsStore'])
        router.put('/api/admin/cms/components/:key', [() => import('#controllers/admin/cms_controller'), 'componentsUpdate'])
        router.delete('/api/admin/cms/components/:key', [() => import('#controllers/admin/cms_controller'), 'componentsDestroy'])
      })
      .use(middleware.permission({ permission: 'cms:manage' }))

    // CMS Records
    router.get('/admin/cms/:key', [() => import('#controllers/admin/cms_controller'), 'recordsPage'])
    router.get('/admin/cms/:key/new', [() => import('#controllers/admin/cms_controller'), 'newRecordPage'])
    router.get('/admin/cms/:key/:id', [() => import('#controllers/admin/cms_controller'), 'recordDetailPage'])
    router
      .group(() => {
        router.get('/api/admin/cms/:key/records', [() => import('#controllers/admin/cms_controller'), 'recordsIndex'])
        router.get('/api/admin/cms/:key/records/trash', [() => import('#controllers/admin/cms_controller'), 'recordsTrash'])
        router.get('/api/admin/cms/:key/records/:id', [() => import('#controllers/admin/cms_controller'), 'recordsShow'])
        router.post('/api/admin/cms/:key/records', [() => import('#controllers/admin/cms_controller'), 'recordsStore'])
        router.post('/api/admin/cms/:key/records/:id/restore', [() => import('#controllers/admin/cms_controller'), 'recordsRestore'])
        router.delete('/api/admin/cms/:key/records/:id/force', [() => import('#controllers/admin/cms_controller'), 'recordsForceDestroy'])
        router.put('/api/admin/cms/:key/records/:id', [() => import('#controllers/admin/cms_controller'), 'recordsUpdate'])
        router.delete('/api/admin/cms/:key/records/:id', [() => import('#controllers/admin/cms_controller'), 'recordsDestroy'])
        router.get('/api/admin/cms/:key/records/:id/revisions', [() => import('#controllers/admin/cms_controller'), 'revisionsIndex'])
        router.post('/api/admin/cms/:key/records/:id/revisions/:revisionId/restore', [
          () => import('#controllers/admin/cms_controller'),
          'revisionsRestore',
        ])
      })
      .use(middleware.permission({ cmsRecord: true }))

    // Media
    router.get('/admin/media', [() => import('#controllers/admin/media_controller'), 'page'])
    router
      .group(() => {
        router.get('/api/admin/media', [() => import('#controllers/admin/media_controller'), 'index'])
        router.get('/api/admin/media/trash', [() => import('#controllers/admin/media_controller'), 'trash'])
        router.post('/api/admin/media', [() => import('#controllers/admin/media_controller'), 'store'])
        router.post('/api/admin/media/:id/file', [() => import('#controllers/admin/media_controller'), 'replace'])
        router.patch('/api/admin/media/:id', [() => import('#controllers/admin/media_controller'), 'update'])
        router.post('/api/admin/media/:id/restore', [() => import('#controllers/admin/media_controller'), 'restore'])
        router.delete('/api/admin/media/:id/force', [() => import('#controllers/admin/media_controller'), 'forceDestroy'])
        router.delete('/api/admin/media/:id', [() => import('#controllers/admin/media_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'media' }))

    // Settings. These pages expose integration configuration (including masked
    // credentials) and the module install surface, so the page routes are gated
    // as well as their APIs.
    router
      .group(() => {
        router.get('/admin/settings', [() => import('#controllers/admin/settings_controller'), 'settingsPage'])
        router.get('/admin/settings/general', [() => import('#controllers/admin/settings_controller'), 'generalSettingsPage'])
        router.get('/admin/website-settings', [() => import('#controllers/admin/settings_controller'), 'websiteSettingsPage'])
        router.get('/admin/settings/application', [() => import('#controllers/admin/settings_controller'), 'applicationSettingsPage'])
        router.get('/admin/integrations', [() => import('#controllers/admin/settings_controller'), 'integrationsPage'])
        router.get('/admin/integrations/google', [() => import('#controllers/admin/settings_controller'), 'integrationsGooglePage'])
        router.get('/admin/integrations/captcha', [() => import('#controllers/admin/settings_controller'), 'integrationsCaptchaPage'])
        router.get('/admin/integrations/google-analytics', [() => import('#controllers/admin/settings_controller'), 'integrationsGaPage'])
        router.get('/admin/integrations/clarity', [() => import('#controllers/admin/settings_controller'), 'integrationsClarityPage'])
        router.get('/admin/settings/email', [() => import('#controllers/admin/mail_settings_controller'), 'page'])
      })
      .use(middleware.pagePermission({ permission: 'settings:manage' }))

    // Outgoing mail (SMTP). Credentials live here, so every route is gated.
    router
      .group(() => {
        router.get('/api/admin/settings/mail', [() => import('#controllers/admin/mail_settings_controller'), 'show'])
        router.put('/api/admin/settings/mail', [() => import('#controllers/admin/mail_settings_controller'), 'update'])
        router.post('/api/admin/settings/mail/test', [() => import('#controllers/admin/mail_settings_controller'), 'sendTest'])
      })
      .use(middleware.permission({ permission: 'settings:manage' }))

    router.get('/api/admin/settings/web', [() => import('#controllers/admin/settings_controller'), 'getWebSettings'])
    router.put('/api/admin/settings/web', [() => import('#controllers/admin/settings_controller'), 'updateWebSettings'])
      .use(middleware.permission({ permission: 'settings:manage' }))
    router.get('/api/admin/settings/integrations', [() => import('#controllers/admin/settings_controller'), 'getIntegrationSettings'])
      .use(middleware.permission({ permission: 'settings:manage' }))
    router.put('/api/admin/settings/integrations', [() => import('#controllers/admin/settings_controller'), 'updateIntegrationSettings'])
      .use(middleware.permission({ permission: 'settings:manage' }))

    // Global (site-wide) custom code — read open to admins; write gated.
    router.get('/api/admin/settings/page-code', [() => import('#controllers/admin/settings_controller'), 'getPageCode'])
    router.put('/api/admin/settings/page-code', [() => import('#controllers/admin/settings_controller'), 'updatePageCode'])
      .use(middleware.permission({ permission: 'settings:manage' }))

    // API Tokens (Personal Access Tokens for the external /api/v1 API).
    // Self-service: any authenticated admin-area user manages their OWN tokens
    // (the controller scopes to auth.user), so no extra permission is required.
    router.get('/admin/settings/api-tokens', [() => import('#controllers/admin/settings_controller'), 'apiTokensPage'])
    /**
     * Moved out of `/admin/integrations/*` — that prefix is nav-gated, so
     * hiding the Integrations menu used to 404 this page. Kept as a redirect
     * because it is a page people bookmark, and a 404 on upgrade reads as
     * "my tokens are gone".
     */
    router.get('/admin/integrations/api-tokens', ({ response }) => response.redirect('/admin/settings/api-tokens'))
    router.get('/api/admin/api-tokens', [() => import('#controllers/admin/api_tokens_controller'), 'index'])
    router.post('/api/admin/api-tokens', [() => import('#controllers/admin/api_tokens_controller'), 'store'])
    router.delete('/api/admin/api-tokens/:id', [() => import('#controllers/admin/api_tokens_controller'), 'destroy'])

    // Database schema installation.
    //
    // `module:install` and `module:uninstall` are separate from `settings:manage`
    // on purpose: every seeded ADMIN holds `settings:manage`, and these routes
    // run DDL, run a build on the server, and restart the process.
    // `module:install` is granted to ADMIN as well as SUPERADMIN — which is why
    // the throttle below is not optional.
    // Operator-facing health: module boot failures, safe mode, asset state.
    router.get('/api/admin/health', [() => import('#controllers/admin/health_controller'), 'admin'])

    router.get('/api/admin/schema/pending', [() => import('#controllers/admin/schema_controller'), 'pending'])
      .use(middleware.permission({ permission: 'module:install' }))
    router.post('/api/admin/schema/install', [() => import('#controllers/admin/schema_controller'), 'install'])
      .use(middleware.permission({ permission: 'module:install' }))
      // Same class of operation as a module install, and previously unthrottled —
      // a trivial self-DoS. One line, and it removes an asymmetry.
      .use(moduleInstallThrottle)
    router.post('/api/admin/modules/:name/uninstall', [() => import('#controllers/admin/schema_controller'), 'uninstallModule'])
      .use(middleware.permission({ permission: 'module:uninstall' }))

    // Module install from the admin UI: spawns a detached installer, then the
    // process restarts itself. The GETs are polled every couple of seconds
    // while one runs, so they are deliberately left unthrottled.
    router
      .group(() => {
        router.get('/api/admin/deployment', [() => import('#controllers/admin/module_install_controller'), 'deployment'])
        router.get('/api/admin/modules/detected', [() => import('#controllers/admin/module_install_controller'), 'detected'])
        router.get('/api/admin/module-install-jobs/latest', [() => import('#controllers/admin/module_install_controller'), 'latest'])
        router.get('/api/admin/module-install-jobs/:id', [() => import('#controllers/admin/module_install_controller'), 'show'])
      })
      .use(middleware.permission({ permission: 'module:install' }))

    router.post('/api/admin/modules/:name/install', [() => import('#controllers/admin/module_install_controller'), 'install'])
      .use(middleware.permission({ permission: 'module:install' }))
      .use(moduleInstallThrottle)

    /**
     * `/admin/plugins` was the plugin manager before plugins became modules.
     * Kept as a redirect rather than deleted: it is a page operators bookmark,
     * and a 404 on an upgrade reads as data loss rather than a move.
     */
    router.get('/admin/plugins', ({ response }) => response.redirect('/admin/settings'))

    // Modules (first-party app areas; enable/disable from Settings)
    // Sidebar nav for enabled modules — available to any admin.
    router.get('/api/admin/modules/menu', [() => import('#controllers/admin/modules_controller'), 'menu'])
    // App nav config (landing on/off + hidden core nav) — available to any admin.
    router.get('/api/admin/nav-config', [() => import('#controllers/admin/settings_controller'), 'navConfig'])
    router
      .group(() => {
        router.get('/api/admin/modules', [() => import('#controllers/admin/modules_controller'), 'index'])
        router.put('/api/admin/modules/:name/toggle', [() => import('#controllers/admin/modules_controller'), 'toggle'])
      })
      .use(middleware.permission({ permission: 'settings:manage' }))
  })
  .use(middleware.auth())
  .use(middleware.navEnabled())

// ── API v1 (external, token-authenticated) ──────────────────────────────────────
// Bearer access tokens (guard 'api'). Effective access = RBAC (permission middleware)
// ∩ token abilities (tokenAbility middleware). Reuses existing services.
router
  .group(() => {
    // Content (explicit route names — avoids Tuyau registry name clashes with the
    // admin content controller, which derives the same `content.*` names).
    router
      .group(() => {
        router.get('/api/v1/content', [() => import('#controllers/api/v1/content_controller'), 'index'])
          .as('v1.content.index')
          .use(middleware.tokenAbility({ ability: 'content:read' }))
        router.get('/api/v1/content/:id', [() => import('#controllers/api/v1/content_controller'), 'show'])
          .as('v1.content.show')
          .use(middleware.tokenAbility({ ability: 'content:read' }))
        router.post('/api/v1/content', [() => import('#controllers/api/v1/content_controller'), 'store'])
          .as('v1.content.store')
          .use(middleware.tokenAbility({ ability: 'content:write' }))
        router.put('/api/v1/content/:id', [() => import('#controllers/api/v1/content_controller'), 'update'])
          .as('v1.content.update')
          .use(middleware.tokenAbility({ ability: 'content:write' }))
        router.delete('/api/v1/content/:id', [() => import('#controllers/api/v1/content_controller'), 'destroy'])
          .as('v1.content.destroy')
          .use(middleware.tokenAbility({ ability: 'content:write' }))
      })
      .use(middleware.permission({ resource: 'content' }))

    // CMS records
    router
      .group(() => {
        router.get('/api/v1/cms/:key/records', [() => import('#controllers/api/v1/cms_records_controller'), 'index'])
          .as('v1.cms.index')
          .use(middleware.tokenAbility({ ability: 'cms:read' }))
        router.get('/api/v1/cms/:key/records/:id', [() => import('#controllers/api/v1/cms_records_controller'), 'show'])
          .as('v1.cms.show')
          .use(middleware.tokenAbility({ ability: 'cms:read' }))
        router.post('/api/v1/cms/:key/records', [() => import('#controllers/api/v1/cms_records_controller'), 'store'])
          .as('v1.cms.store')
          .use(middleware.tokenAbility({ ability: 'cms:write' }))
        router.put('/api/v1/cms/:key/records/:id', [() => import('#controllers/api/v1/cms_records_controller'), 'update'])
          .as('v1.cms.update')
          .use(middleware.tokenAbility({ ability: 'cms:write' }))
        router.delete('/api/v1/cms/:key/records/:id', [() => import('#controllers/api/v1/cms_records_controller'), 'destroy'])
          .as('v1.cms.destroy')
          .use(middleware.tokenAbility({ ability: 'cms:write' }))
      })
      .use(middleware.permission({ cmsRecord: true }))
  })
  .use(middleware.auth({ guards: ['api'] }))
  .use(apiV1Throttle)



// ── Modules (first-party app areas; routes guarded per-request) ─────────────────

registerAllModuleRoutes(router, middleware)

// ── Public CMS pages (catch-all — MUST stay last) ───────────────────────────────
// Resolves a published builder page by its `path`; 404s reserved prefixes & misses.
router.get('*', [() => import('#controllers/pages_public_controller'), 'show'])
