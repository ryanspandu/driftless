import { Link, router } from '@inertiajs/react'
import {
  BarChart3,
  Boxes,
  FileText,
  Home,
  Image as ImageIcon,
  Key,
  Plug2,
  Settings2,
  Shield,
  Users,
  LogOut,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { useCmsCollectionsList } from '~/hooks/api/use-cms-collections'

interface MenuItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  activeMatch?: 'exact' | 'prefix'
}

const navItems: MenuItem[] = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: Home },
  { title: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { title: 'Content', href: '/admin/content', icon: FileText, activeMatch: 'prefix' },
  { title: 'Users', href: '/admin/users', icon: Users, activeMatch: 'prefix' },
  { title: 'Roles', href: '/admin/roles', icon: Shield, activeMatch: 'prefix' },
  { title: 'Permissions', href: '/admin/permissions', icon: Key, activeMatch: 'prefix' },
  { title: 'Media', href: '/admin/media', icon: ImageIcon },
  { title: 'Collections', href: '/admin/cms/collections', icon: Boxes, activeMatch: 'prefix' },
  { title: 'Integrations', href: '/admin/integrations', icon: Plug2, activeMatch: 'prefix' },
  { title: 'Settings', href: '/admin/settings', icon: Settings2 },
]

function isActive(pathname: string, item: MenuItem): boolean {
  if (item.activeMatch === 'prefix') {
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }
  return pathname === item.href
}

export function AppSidebar({ pathname }: { pathname: string }) {
  const collectionsQuery = useCmsCollectionsList()
  const collections = collectionsQuery.data ?? []
  const collapsed = false

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-4 border-b border-sidebar-border shrink-0">
        <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          D
        </div>
        {!collapsed && <span className="font-semibold text-sm truncate">Driftless</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const active = isActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-ring font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
              title={collapsed ? item.title : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.title}</span>}
            </Link>
          )
        })}

        {/* Dynamic collections */}
        {collections.length > 0 && (
          <>
            {!collapsed && (
              <div className="px-2 pt-3 pb-1">
                <p className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Collections
                </p>
              </div>
            )}
            {collections.map((col) => {
              const href = `/admin/cms/${col.key}`
              const active = isActive(pathname, { title: col.label, href, icon: Boxes, activeMatch: 'prefix' })
              return (
                <Link
                  key={col.id}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                  title={collapsed ? col.label : undefined}
                >
                  <Boxes className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{col.label}</span>}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <a
          href="/logout"
          onClick={(e) => {
            e.preventDefault()
            router.post('/logout')
          }}
          className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          title={collapsed ? 'Log out' : undefined}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </a>
      </div>
    </aside>
  )
}
