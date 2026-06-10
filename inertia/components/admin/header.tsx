import { ConnectionIndicator } from '~/components/admin/connection-indicator'
import { SyncCenter } from '~/components/admin/sync-center'
import { ThemeToggle } from '~/components/admin/theme-toggle'
import { UserAccountDropdown } from '~/components/admin/user-account-dropdown'

const PAGE_LABELS: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/analytics': 'Analytics',
  '/admin/content': 'Content',
  '/admin/media': 'Media Library',
  '/admin/users': 'Users',
  '/admin/roles': 'Roles',
  '/admin/permissions': 'Permissions',
  '/admin/settings': 'Website Settings',
  '/admin/profile': 'Profile',
  '/admin/integrations': 'Integrations',
  '/admin/cms/collections': 'CMS Collections',
}

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]
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

interface AdminHeaderProps {
  pathname: string
}

export function AdminHeader({ pathname }: AdminHeaderProps) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold truncate">{getPageLabel(pathname)}</h1>
      </div>
      <div className="flex items-center gap-2">
        <SyncCenter />
        <ConnectionIndicator />
        <ThemeToggle />
        <UserAccountDropdown />
      </div>
    </header>
  )
}
