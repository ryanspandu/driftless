import { Fragment, useMemo, useState } from 'react'
import { Link, router } from '@inertiajs/react'
import {
  BarChart3,
  Blocks,
  Boxes,
  FileText,
  Home,
  Image as ImageIcon,
  Key,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Plug2,
  Settings2,
  Shield,
  Users,
  LogOut,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { useCmsCollectionsList } from '~/hooks/api/use-cms-collections'
import { useEnabledPluginsMenu } from '~/hooks/api/use-plugins'
import { CollectionMenuIcon } from '~/components/cms/collection-menu-icon'

/** lucide icon names a plugin manifest may reference for its sidebar entry. */
const PLUGIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Megaphone,
  Plug2,
  FileText,
  Boxes,
}

function pluginIcon(name: string): React.ComponentType<{ className?: string }> {
  return PLUGIN_ICONS[name] ?? Plug2
}

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
  { title: 'Plugins', href: '/admin/plugins', icon: Plug2, activeMatch: 'prefix' },
  { title: 'Integrations', href: '/admin/integrations', icon: Blocks, activeMatch: 'prefix' },
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
  const pluginsMenuQuery = useEnabledPluginsMenu()
  const pluginMenu = pluginsMenuQuery.data ?? []

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('sidebar:collapsed') === '1'
  })
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('sidebar:collapsed', next ? '1' : '0')
      }
      return next
    })
  }

  // Collections without a group fall under the default "Collections" section.
  // Each distinct group value becomes its own section (header = group name).
  const collectionSections = useMemo(() => {
    type Section = { key: string; label: string; cols: typeof collections }
    const ungrouped: typeof collections = []
    const grouped = new Map<string, typeof collections>()

    // Native collections (source PRISMA: content / media / user) each already
    // have a dedicated top-level nav item, so only list dynamic collections here
    // to avoid duplicate sidebar entries.
    const dynamicCollections = collections.filter((c) => c.source === 'DYNAMIC')

    for (const col of dynamicCollections) {
      const group = col.group?.trim()
      if (!group) {
        ungrouped.push(col)
        continue
      }
      const existing = grouped.get(group)
      if (existing) existing.push(col)
      else grouped.set(group, [col])
    }

    const sections: Section[] = []
    if (ungrouped.length > 0) {
      sections.push({ key: '__ungrouped__', label: 'Collections', cols: ungrouped })
    }
    for (const [label, cols] of Array.from(grouped.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      sections.push({ key: `group:${label}`, label, cols })
    }
    return sections
  }, [collections])

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          'flex items-center h-14 border-b border-sidebar-border shrink-0',
          collapsed ? 'justify-center px-2' : 'gap-3 px-4'
        )}
      >
        {!collapsed && (
          <>
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
              D
            </div>
            <span className="font-semibold text-sm truncate">Driftless</span>
          </>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            'flex items-center justify-center size-8 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
            !collapsed && 'ml-auto'
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" />
          )}
        </button>
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

        {/* Dynamic collections, grouped by each collection's `group` value */}
        {collectionSections.map((section) => (
          <Fragment key={section.key}>
            {!collapsed && (
              <div className="px-2 pt-3 pb-1">
                <p className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  {section.label}
                </p>
              </div>
            )}
            {section.cols.map((col) => {
              const href = `/admin/cms/${col.key}`
              const active = isActive(pathname, { title: col.label, href, icon: Boxes, activeMatch: 'prefix' })
              return (
                <Link
                  key={col.id}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent text-ring font-medium'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                  title={collapsed ? col.label : undefined}
                >
                  {col.icon?.trim() ? (
                    <CollectionMenuIcon icon={col.icon} className="size-4 shrink-0" />
                  ) : (
                    <Boxes className="size-4 shrink-0" />
                  )}
                  {!collapsed && <span className="truncate">{col.label}</span>}
                </Link>
              )
            })}
          </Fragment>
        ))}

        {/* Enabled plugins' menu entries */}
        {pluginMenu.length > 0 && (
          <Fragment>
            {!collapsed && (
              <div className="px-2 pt-3 pb-1">
                <p className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Plugins
                </p>
              </div>
            )}
            {pluginMenu.map((item) => {
              const active = isActive(pathname, {
                title: item.title,
                href: item.href,
                icon: Plug2,
                activeMatch: 'prefix',
              })
              const Icon = pluginIcon(item.icon)
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
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.title}</span>}
                </Link>
              )
            })}
          </Fragment>
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
