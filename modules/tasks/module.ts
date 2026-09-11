import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/tasks/routes'

/**
 * Tasks — a minimal first-party module: a lightweight task tracker that doubles
 * as the reference example for the module system (and a seed for a future
 * project-management module).
 */
export default defineModule({
  name: 'tasks',
  label: 'To do list',
  description: 'A Trello-style to-do list with a kanban board and assignees.',
  version: '1.0.0',
  autoEnable: true,
  permissions: [
    { name: 'tasks:read', description: 'View tasks.' },
    { name: 'tasks:manage', description: 'Create / update / delete tasks.' },
  ],
  nav: {
    label: 'To do list',
    icon: 'Kanban',
    order: 20,
    href: '/admin/tasks',
    permission: 'tasks:read',
  },
  registerRoutes,
})
