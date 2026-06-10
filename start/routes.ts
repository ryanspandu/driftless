import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

// ── Public ────────────────────────────────────────────────────────────────────

router.get('/', [() => import('#controllers/public_controller'), 'home']).as('home')
router.get('/posts/:slug', [() => import('#controllers/public_controller'), 'post'])
router.get('/offline', [() => import('#controllers/public_controller'), 'offline'])

router.get('/api/public/content', [() => import('#controllers/public_content_controller'), 'index'])
router.get('/api/public/content/:slug', [() => import('#controllers/public_content_controller'), 'show'])

router.get('/robots.txt', [() => import('#controllers/seo_controller'), 'robots'])
router.get('/sitemap.xml', [() => import('#controllers/seo_controller'), 'sitemap'])
router.get('/health', ({ response }) => response.json({ ok: true }))

// ── Auth Config (public) ──────────────────────────────────────────────────────

router.get('/api/auth/config', [() => import('#controllers/admin/settings_controller'), 'getAuthConfig'])

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get('/auth/google/status', [() => import('#controllers/google_auth_controller'), 'status'])
router.get('/auth/google', [() => import('#controllers/google_auth_controller'), 'start'])
router.get('/auth/google/callback', [() => import('#controllers/google_auth_controller'), 'callback'])

// ── Auth ──────────────────────────────────────────────────────────────────────

router
  .group(() => {
    router.get('/register', [() => import('#controllers/new_account_controller'), 'create']).as('new_account.create')
    router.post('/register', [() => import('#controllers/new_account_controller'), 'store']).as('new_account.store')
    router.get('/login', [() => import('#controllers/session_controller'), 'create']).as('session.create')
    router.post('/login', [() => import('#controllers/session_controller'), 'store']).as('session.store')

    // Legacy aliases (explicit names — same controller action must not reuse new_account.store)
    router.get('/signup', ({ response }) => response.redirect('/register'))
    router
      .post('/signup', [() => import('#controllers/new_account_controller'), 'store'])
      .as('legacy.signup.store')

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
    router.get('/admin/users', [() => import('#controllers/admin/users_controller'), 'page'])
    router
      .get('/api/admin/users/generate-password', [() => import('#controllers/admin/users_controller'), 'generatePassword'])
      .use(middleware.permission({ permission: 'user:manage' }))
    router
      .group(() => {
        router.get('/api/admin/users', [() => import('#controllers/admin/users_controller'), 'index'])
        router.post('/api/admin/users', [() => import('#controllers/admin/users_controller'), 'store'])
        router.put('/api/admin/users/:id', [() => import('#controllers/admin/users_controller'), 'update'])
        router.delete('/api/admin/users/:id', [() => import('#controllers/admin/users_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'user' }))

    // Roles
    router.get('/admin/roles', [() => import('#controllers/admin/roles_controller'), 'page'])
    router.get('/admin/roles/new', [() => import('#controllers/admin/roles_controller'), 'newPage'])
    router.get('/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'detailPage'])
    router
      .group(() => {
        router.get('/api/admin/roles', [() => import('#controllers/admin/roles_controller'), 'index'])
        router.get('/api/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'show'])
        router.post('/api/admin/roles', [() => import('#controllers/admin/roles_controller'), 'store'])
        router.put('/api/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'update'])
        router.delete('/api/admin/roles/:id', [() => import('#controllers/admin/roles_controller'), 'destroy'])
      })
      .use(middleware.permission({ permission: 'role:manage' }))

    // Permissions
    router.get('/admin/permissions', [() => import('#controllers/admin/permissions_controller'), 'page'])
    router.get('/admin/permissions/new', [() => import('#controllers/admin/permissions_controller'), 'newPage'])
    router.get('/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'detailPage'])
    router
      .group(() => {
        router.get('/api/admin/permissions', [() => import('#controllers/admin/permissions_controller'), 'index'])
        router.get('/api/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'show'])
        router.post('/api/admin/permissions', [() => import('#controllers/admin/permissions_controller'), 'store'])
        router.put('/api/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'update'])
        router.delete('/api/admin/permissions/:id', [() => import('#controllers/admin/permissions_controller'), 'destroy'])
      })
      .use(middleware.permission({ permission: 'permission:manage' }))

    // Content
    router.get('/admin/content', [() => import('#controllers/admin/content_controller'), 'page'])
    router
      .group(() => {
        router.get('/api/admin/content', [() => import('#controllers/admin/content_controller'), 'index'])
        router.post('/api/admin/content', [() => import('#controllers/admin/content_controller'), 'store'])
        router.put('/api/admin/content/:id', [() => import('#controllers/admin/content_controller'), 'update'])
        router.delete('/api/admin/content/:id', [() => import('#controllers/admin/content_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'content' }))

    // CMS Collections
    router.get('/admin/cms/collections', [() => import('#controllers/admin/cms_controller'), 'collectionsPage'])
    router.get('/admin/cms/collections/new', [() => import('#controllers/admin/cms_controller'), 'collectionsNewPage'])
    router.get('/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionDetailPage'])
    router
      .group(() => {
        router.get('/api/admin/cms/collections', [() => import('#controllers/admin/cms_controller'), 'collectionsIndex'])
        router.get('/api/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionsShow'])
        router.post('/api/admin/cms/collections', [() => import('#controllers/admin/cms_controller'), 'collectionsStore'])
        router.put('/api/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionsUpdate'])
        router.delete('/api/admin/cms/collections/:key', [() => import('#controllers/admin/cms_controller'), 'collectionsDestroy'])
        router.post('/api/admin/cms/collections/:key/fields', [() => import('#controllers/admin/cms_controller'), 'fieldsStore'])
        router.put('/api/admin/cms/collections/:key/fields/:fieldKey', [() => import('#controllers/admin/cms_controller'), 'fieldsUpdate'])
        router.patch('/api/admin/cms/collections/:key/fields/reorder', [() => import('#controllers/admin/cms_controller'), 'fieldsReorder'])
        router.delete('/api/admin/cms/collections/:key/fields/:fieldKey', [() => import('#controllers/admin/cms_controller'), 'fieldsDestroy'])
      })
      .use(middleware.permission({ permission: 'cms:manage' }))

    // CMS Records
    router.get('/admin/cms/:key', [() => import('#controllers/admin/cms_controller'), 'recordsPage'])
    router.get('/admin/cms/:key/new', [() => import('#controllers/admin/cms_controller'), 'newRecordPage'])
    router.get('/admin/cms/:key/:id', [() => import('#controllers/admin/cms_controller'), 'recordDetailPage'])
    router
      .group(() => {
        router.get('/api/admin/cms/:key/records', [() => import('#controllers/admin/cms_controller'), 'recordsIndex'])
        router.get('/api/admin/cms/:key/records/:id', [() => import('#controllers/admin/cms_controller'), 'recordsShow'])
        router.post('/api/admin/cms/:key/records', [() => import('#controllers/admin/cms_controller'), 'recordsStore'])
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
        router.post('/api/admin/media', [() => import('#controllers/admin/media_controller'), 'store'])
        router.delete('/api/admin/media/:id', [() => import('#controllers/admin/media_controller'), 'destroy'])
      })
      .use(middleware.permission({ resource: 'media' }))

    // Settings
    router.get('/admin/settings', [() => import('#controllers/admin/settings_controller'), 'settingsPage'])
    router.get('/admin/integrations', [() => import('#controllers/admin/settings_controller'), 'integrationsPage'])
    router.get('/admin/integrations/google', [() => import('#controllers/admin/settings_controller'), 'integrationsGooglePage'])
    router.get('/admin/integrations/captcha', [() => import('#controllers/admin/settings_controller'), 'integrationsCaptchaPage'])
    router.get('/admin/integrations/google-analytics', [() => import('#controllers/admin/settings_controller'), 'integrationsGaPage'])
    router.get('/admin/integrations/clarity', [() => import('#controllers/admin/settings_controller'), 'integrationsClarityPage'])

    router.get('/api/admin/settings/web', [() => import('#controllers/admin/settings_controller'), 'getWebSettings'])
    router.put('/api/admin/settings/web', [() => import('#controllers/admin/settings_controller'), 'updateWebSettings']).use(
      middleware.permission({ permission: 'settings:manage' })
    )
    router.get('/api/admin/settings/integrations', [() => import('#controllers/admin/settings_controller'), 'getIntegrationSettings']).use(
      middleware.permission({ permission: 'settings:manage' })
    )
    router.put('/api/admin/settings/integrations', [() => import('#controllers/admin/settings_controller'), 'updateIntegrationSettings']).use(
      middleware.permission({ permission: 'settings:manage' })
    )
  })
  .use(middleware.auth())
