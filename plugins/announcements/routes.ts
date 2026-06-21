import type { HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware } from '#plugins/types'

const AdminController = () => import('#plugins/announcements/controllers/announcements_controller')
const PublicController = () =>
  import('#plugins/announcements/controllers/announcements_public_controller')

/**
 * All routes are registered at boot and guarded per-request by `pluginEnabled`,
 * so toggling the plugin off/on takes effect without a server restart.
 */
export function registerRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  // Admin dashboard page (FE: ui/admin) — auth + plugin-enabled.
  router
    .get('/admin/announcements', [AdminController, 'page'])
    .use(middleware.auth())
    .use(middleware.pluginEnabled({ name: 'announcements' }))

  // Admin API — auth + permission + plugin-enabled.
  router
    .group(() => {
      router.get('/api/admin/announcements', [AdminController, 'index'])
      router.post('/api/admin/announcements', [AdminController, 'store'])
      router.put('/api/admin/announcements/:id', [AdminController, 'update'])
      router.delete('/api/admin/announcements/:id', [AdminController, 'destroy'])
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'announcements:manage' }))
    .use(middleware.pluginEnabled({ name: 'announcements' }))

  // Public page (FE: ui/public) — plugin-enabled only.
  router
    .get('/announcements', [PublicController, 'page'])
    .use(middleware.pluginEnabled({ name: 'announcements' }))
}
