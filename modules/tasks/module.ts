import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/tasks/routes'

/**
 * Tasks — a minimal first-party module: a lightweight task tracker that doubles
 * as the reference example for the module system (and a seed for a future
 * project-management module).
 */
export default defineModule({
  name: 'tasks',
  label: 'Tasks',
  description: 'A lightweight task tracker — a seed for project management.',
  version: '1.0.0',
  autoEnable: true,
  permissions: [
    { name: 'tasks:read', description: 'View tasks.' },
    { name: 'tasks:manage', description: 'Create / update / delete tasks.' },
  ],
  nav: {
    label: 'Tasks',
    icon: 'ListChecks',
    order: 20,
    href: '/admin/tasks',
    permission: 'tasks:read',
  },
  registerRoutes,
})
