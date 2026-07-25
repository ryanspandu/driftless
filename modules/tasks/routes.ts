import type { HttpRouterService } from '@adonisjs/core/types'
import type { NamedMiddleware } from '#modules/types'

const Ctrl = () => import('#modules/tasks/controllers/tasks_controller')

/**
 * All routes are registered at boot and guarded per-request by `moduleEnabled`,
 * so toggling the module off/on from Settings takes effect without a restart.
 */
export function registerRoutes(router: HttpRouterService, middleware: NamedMiddleware) {
  // Admin page (FE: ui/admin) — auth + module-enabled.
  router
    .get('/admin/tasks', [Ctrl, 'page'])
    .use(middleware.auth())
    .use(middleware.moduleEnabled({ name: 'tasks' }))

  // Read API — auth + tasks:read + module-enabled.
  router
    .group(() => {
      router.get('/api/admin/tasks', [Ctrl, 'index'])
      router.get('/api/admin/tasks/assignees', [Ctrl, 'assignees'])
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'tasks:read' }))
    .use(middleware.moduleEnabled({ name: 'tasks' }))

  // Write API — auth + tasks:manage + module-enabled.
  router
    .group(() => {
      router.post('/api/admin/tasks', [Ctrl, 'store'])
      router.patch('/api/admin/tasks/:id/move', [Ctrl, 'move'])
      router.put('/api/admin/tasks/:id', [Ctrl, 'update'])
      router.delete('/api/admin/tasks/:id', [Ctrl, 'destroy'])
    })
    .use(middleware.auth())
    .use(middleware.permission({ permission: 'tasks:manage' }))
    .use(middleware.moduleEnabled({ name: 'tasks' }))
}
