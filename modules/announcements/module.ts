import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/announcements/routes'

/**
 * Announcements — the reference **plugin**: a small package that co-locates its
 * back-end with two front-ends (an admin screen and a public page).
 *
 * `kind: 'plugin'` is the whole difference from an app. It lives under
 * `modules/` and uses the same manifest because a second parallel system for
 * plugins is precisely what this replaced — the two had drifted, and the plugin
 * half was the stale copy.
 */
export default defineModule({
  name: 'announcements',
  kind: 'plugin',
  label: 'Announcements',
  description: 'Publish short announcements for your visitors to read.',
  version: '1.0.0',
  autoEnable: true,
  permissions: [
    { name: 'announcements:manage', description: 'Create / update / delete announcements.' },
    { name: 'announcements:read', description: 'Read announcements.' },
  ],
  /**
   * A flat link rather than a group, which is what `adminMenu` used to be. It
   * now also carries a permission, so the entry is hidden from anyone who
   * cannot open it — the old plugin sidebar rendered unconditionally.
   */
  nav: {
    label: 'Announcements',
    icon: 'Megaphone',
    order: 90,
    href: '/admin/announcements',
    permission: 'announcements:read',
  },
  registerRoutes,
})
