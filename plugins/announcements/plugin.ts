import type { PluginManifest } from '#plugins/types'
import { registerRoutes } from '#plugins/announcements/routes'

/**
 * Announcements — a minimal example plugin demonstrating co-located back-end +
 * two front-ends: an admin dashboard (`ui/admin`) and a public page (`ui/public`).
 */
const announcements: PluginManifest = {
  name: 'announcements',
  label: 'Announcements',
  description: 'Publish short announcements for your visitors to read.',
  version: '1.0.0',
  autoEnable: true,
  permissions: [
    { name: 'announcements:manage', description: 'Create / update / delete announcements.' },
    { name: 'announcements:read', description: 'Read announcements.' },
  ],
  adminMenu: { title: 'Announcements', href: '/admin/announcements', icon: 'Megaphone' },
  registerRoutes,
}

export default announcements
