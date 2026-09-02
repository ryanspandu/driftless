import { Fragment } from 'react'
import { Link } from '@inertiajs/react'
import { CaretRight } from '@phosphor-icons/react'
import { ConnectionIndicator } from '~/components/admin/connection-indicator'
import { SyncCenter } from '~/components/admin/sync-center'
import { ThemeToggle } from '~/components/admin/theme-toggle'
import { UserAccountDropdown } from '~/components/admin/user-account-dropdown'
import { modulePageLabel } from '~/lib/module-labels'

/**
 * Core pages only. A module's pages are labelled by the module — see
 * `modulePageLabel` — so this table never has to learn what is installed.
 */
const PAGE_LABELS: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/analytics': 'Analytics',
  '/admin/forms': 'Forms',
  '/admin/redirects': 'Redirects',
  '/admin/content': 'Content',
  '/admin/media': 'Media',
  '/admin/users': 'Users',
  '/admin/roles': 'Roles',
  '/admin/permissions': 'Permissions',
  '/admin/pages': 'Pages',
  '/admin/templates': 'Templates',
  '/admin/settings': 'Settings',
  '/admin/settings/appearance': 'Appearance',
  '/admin/settings/general': 'General',
  // The URL still says "application"; the page is the module manager, and a
  // breadcrumb describes the page rather than the route that reaches it.
  '/admin/settings/application': 'Modules',
  '/admin/settings/email': 'Email',
  '/admin/settings/api-tokens': 'API tokens',
  '/admin/website-settings': 'Website settings',
  '/admin/profile': 'Profile',
  '/admin/integrations': 'Integrations',
  '/admin/cms/collections': 'Collections',
}

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]

  // Modules get a say before the core prefix rules, since their paths are
  // namespaced and cannot collide with the ones handled below.
  const fromModule = modulePageLabel(pathname)
  if (fromModule) return fromModule

  if (pathname.startsWith('/admin/cms/collections/')) return 'Collection Settings'
  if (pathname.startsWith('/admin/cms/')) {
    const parts = pathname.split('/')
    if (parts.length >= 4) {
      const key = parts[3]
      if (parts.length === 4) return `${key} Records`
      return 'Edit Record'
    }
  }
  if (pathname.startsWith('/admin/integrations/')) return 'Integration'
  return 'Admin'
}

/** Breadcrumb trail for the top bar. The root crumb links back to the dashboard. */
function getCrumbs(pathname: string): { label: string; href?: string }[] {
  if (pathname === '/admin/dashboard') return [{ label: 'Dashboard' }]
  return [{ label: 'Admin', href: '/admin/dashboard' }, { label: getPageLabel(pathname) }]
}

interface AdminHeaderProps {
  pathname: string
}

export function AdminHeader({ pathname }: AdminHeaderProps) {
  const crumbs = getCrumbs(pathname)
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && (
              <CaretRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {crumb.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <SyncCenter />
        <ConnectionIndicator />
        <ThemeToggle />
        <UserAccountDropdown />
      </div>
    </header>
  )
}
