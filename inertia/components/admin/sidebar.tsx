import { Fragment, useMemo, useState } from 'react'
import { Link, router } from '@inertiajs/react'
import {
  Browsers,
  CaretDown,
  ChartBar,
  FileText,
  Globe,
  House,
  Image as ImageIcon,
  Key,
  Layout,
  ShieldCheck,
  SidebarSimple,
  SignOut,
  SlidersHorizontal,
  Stack,
  SquaresFour,
  Users,
  type Icon,
} from '@phosphor-icons/react'
// Collection icons are still referenced by Lucide name in stored data, so that
// code path keeps using Lucide (see CollectionMenuIcon).
import { Boxes } from 'lucide-react'
import { cn } from '~/lib/utils'
import { useAdminBranding } from '~/hooks/use-admin-branding'
import { useAutoHideScrollbar } from '~/hooks/use-auto-hide-scrollbar'
import { useCmsCollectionsList } from '~/hooks/api/use-cms-collections'
import { useModulesMenu } from '~/hooks/api/use-modules'
import { useNavConfig } from '~/hooks/api/use-nav-config'
import { useAbility } from '~/components/providers/ability-provider'
import { CollectionMenuIcon } from '~/components/cms/collection-menu-icon'
import { phosphorIconByName } from '~/lib/phosphor-icon'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'

interface MenuItem {
  title: string
  href: string
  icon: Icon
  activeMatch?: 'exact' | 'prefix'
}

interface NavParent {
  title: string
  icon: Icon
  children: MenuItem[]
}

/** A nav entry is either a flat link or a collapsible parent (with sub-items). */
type NavEntry = MenuItem | NavParent
const isParent = (entry: NavEntry): entry is NavParent => 'children' in entry

const navEntries: NavEntry[] = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: House },
  { title: 'Analytics', href: '/admin/analytics', icon: ChartBar },
  {
    title: 'UI',
    icon: SquaresFour,
    children: [
      { title: 'Content', href: '/admin/content', icon: FileText, activeMatch: 'prefix' },
      { title: 'Pages', href: '/admin/pages', icon: Browsers, activeMatch: 'prefix' },
      { title: 'Templates', href: '/admin/templates', icon: Layout, activeMatch: 'prefix' },
      {
        title: 'Website settings',
        href: '/admin/website-settings',
        icon: Globe,
        activeMatch: 'prefix',
      },
    ],
  },
  { title: 'Media', href: '/admin/media', icon: ImageIcon },
  { title: 'Collections', href: '/admin/cms/collections', icon: Stack, activeMatch: 'prefix' },
  { title: 'Components', href: '/admin/cms/components', icon: Boxes, activeMatch: 'prefix' },
  /**
   * Integrations is deliberately **not** here. It is configured once and then
   * forgotten, which is what "settings" means — a top-level entry put it on a
   * par with Dashboard and Media, and duplicated a card that already exists on
   * the Settings hub. It lives at Settings → Integrations now.
   */
  {
    title: 'User Management',
    icon: Users,
    children: [
      { title: 'Users', href: '/admin/users', icon: Users, activeMatch: 'prefix' },
      { title: 'Roles', href: '/admin/roles', icon: ShieldCheck, activeMatch: 'prefix' },
      { title: 'Permissions', href: '/admin/permissions', icon: Key, activeMatch: 'prefix' },
    ],
  },
  { title: 'Settings', href: '/admin/settings', icon: SlidersHorizontal },
]

/** Active-state matching only needs the href + match strategy, not the icon. */
type ActiveTarget = { href: string; activeMatch?: 'exact' | 'prefix' }

function isActive(pathname: string, item: ActiveTarget): boolean {
  if (item.activeMatch === 'prefix') {
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }
  return pathname === item.href
}

/**
 * Of several nav hrefs that all match, the most specific one.
 *
 * Prefix matching is genuinely wanted — `/admin/ecommerce/products/123` should
 * keep "Products" lit — but on its own it lights up every ancestor too, so a
 * module whose dashboard sits at `/admin/ecommerce` showed both "Dashboard" and
 * "Products" as active at once. Longest match wins, which is the same rule a
 * router uses and needs no per-item configuration to stay correct as nav grows.
 *
 * Returns null when nothing matches.
 */
function mostSpecificMatch(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(href + '/')
    if (matches && (best === null || href.length > best.length)) best = href
  }
  return best
}

/**
 * Shared classes for a nav row in its active vs. resting state.
 *
 * When collapsed the row is an icon-only pill, so the icon is centred and the
 * left `ActiveBar` is dropped (see the call sites) — on the narrow rail that bar
 * detaches from the pill and reads as a stray floating line. The tinted rounded
 * background carries the active state on its own there.
 */
function rowClasses(active: boolean, collapsed = false): string {
  return cn(
    'group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
    collapsed && 'justify-center',
    active
      ? 'bg-sidebar-active font-medium text-sidebar-active-foreground'
      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
  )
}

/** The brand-coloured indicator bar shown on the active row's left edge. */
function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-active-bar"
    />
  )
}

export function AppSidebar({ pathname }: { pathname: string }) {
  const collectionsQuery = useCmsCollectionsList()
  const collections = collectionsQuery.data ?? []
  const modulesMenuQuery = useModulesMenu()
  const moduleMenu = modulesMenuQuery.data ?? []
  const navConfigQuery = useNavConfig()
  const hiddenNav = navConfigQuery.data?.hiddenNav ?? []
  const { me, permissions } = useAbility()

  const displayName =
    me?.fullName?.trim() ||
    [me?.firstName, me?.lastName].filter(Boolean).join(' ').trim() ||
    me?.username ||
    'User'
  const roleLabel = me?.roles?.[0] ?? 'Member'
  const initials = me
    ? `${me.firstName?.[0] ?? ''}${me.lastName?.[0] ?? ''}`.toUpperCase() ||
      me.email?.[0]?.toUpperCase() ||
      'U'
    : 'U'

  const branding = useAdminBranding()
  const navRef = useAutoHideScrollbar<HTMLElement>()

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

  // Which parent menus are expanded (persisted; defaults to open when a child is active).
  const [openParents, setOpenParents] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(window.localStorage.getItem('sidebar:openParents') || '{}')
    } catch {
      return {}
    }
  })
  const toggleParent = (title: string) => {
    setOpenParents((prev) => {
      const next = { ...prev, [title]: !prev[title] }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('sidebar:openParents', JSON.stringify(next))
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

  const logout = () => router.post('/logout')

  /** Section header with a sentence-case label and a trailing hairline divider. */
  const sectionHeader = (label: string) =>
    !collapsed && (
      <div className="flex items-center gap-2 px-2.5 pt-4 pb-1.5">
        <span className="text-[11px] font-medium text-sidebar-foreground/45">{label}</span>
        <span className="h-px flex-1 bg-sidebar-border" />
      </div>
    )

  const renderItem = (item: MenuItem) => {
    const active = isActive(pathname, item)
    return (
      <Link
        key={item.href}
        href={item.href}
        className={rowClasses(active, collapsed)}
        title={collapsed ? item.title : undefined}
      >
        {active && !collapsed && <ActiveBar />}
        <item.icon
          weight={active ? 'duotone' : 'regular'}
          className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110"
        />
        {!collapsed && <span className="truncate">{item.title}</span>}
      </Link>
    )
  }

  /** A single module nav link (flat module, or a group's sub-item). */
  const renderModuleLink = (label: string, href: string, iconName?: string) => {
    // Not `isActive` with a prefix: an ancestor href would match too. Only the
    // most specific of the module's hrefs is lit — see `mostSpecificMatch`.
    const active = href === activeModuleHref
    const Icon = phosphorIconByName(iconName)
    return (
      <Link
        key={href}
        href={href}
        className={rowClasses(active, collapsed)}
        title={collapsed ? label : undefined}
      >
        {active && !collapsed && <ActiveBar />}
        <Icon
          weight={active ? 'duotone' : 'regular'}
          className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110"
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    )
  }

  // Core nav entries the user hasn't hidden from Settings → Application.
  const visibleNavEntries = navEntries.filter((e) => !hiddenNav.includes(e.title))

  // Enabled modules' nav, filtered by the current user's permissions.
  const canSeeModule = (perm?: string) => !perm || permissions.has(perm)
  const visibleModules = moduleMenu
    .filter((g) => canSeeModule(g.permission))
    .map((g) => ({ ...g, items: g.items?.filter((i) => canSeeModule(i.permission)) }))
    .filter((g) => (g.items ? g.items.length > 0 : !!g.href))

  /**
   * Computed across *all* module hrefs at once, not per group, because a flat
   * module link and another module's child could nest just as easily as two
   * siblings do.
   */
  const activeModuleHref = mostSpecificMatch(
    pathname,
    visibleModules.flatMap((g) => [
      ...(g.href ? [g.href] : []),
      ...(g.items ?? []).map((i) => i.href),
    ])
  )

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
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.projectName}
                className="size-8 shrink-0 rounded-lg object-contain"
              />
            ) : (
              /* No logo set: the initial badge, which is what this has always
                 shown. Falling back to a file would make a cleared logo look
                 like a broken image. */
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground ring-2 ring-primary/15">
                {branding.projectName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">{branding.projectName}</span>
              <span className="truncate text-[11px] text-sidebar-foreground/50">
                {branding.projectTagline}
              </span>
            </div>
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
          <SidebarSimple className="size-[18px] shrink-0" />
        </button>
      </div>

      {/* Nav */}
      <nav ref={navRef} className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-overlay">
        {collapsed
          ? // Icon-only sidebar: flatten parent children to plain icon links.
            visibleNavEntries
              .flatMap((entry) => (isParent(entry) ? entry.children : [entry]))
              .map((item) => renderItem(item))
          : visibleNavEntries.map((entry) => {
              if (!isParent(entry)) return renderItem(entry)
              const open = !!openParents[entry.title]
              const childActive = entry.children.some((c) => isActive(pathname, c))
              return (
                <div key={entry.title}>
                  <button
                    type="button"
                    onClick={() => toggleParent(entry.title)}
                    aria-expanded={open}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
                      childActive
                        ? 'text-sidebar-foreground font-medium'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                  >
                    <entry.icon
                      weight={childActive ? 'duotone' : 'regular'}
                      className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110"
                    />
                    <span className="truncate">{entry.title}</span>
                    <CaretDown
                      className={cn(
                        'ml-auto size-4 shrink-0 transition-transform duration-200',
                        open ? '' : '-rotate-90'
                      )}
                    />
                  </button>
                  {/* Animated expand/collapse via grid-rows 0fr → 1fr */}
                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-200 ease-out',
                      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
                        {entry.children.map((item) => renderItem(item))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

        {/* First-party modules — "Apps" section (collapsible groups or flat links) */}
        {visibleModules.length > 0 && (
          <Fragment>
            {sectionHeader('Apps')}
            {collapsed
              ? visibleModules.flatMap((g) =>
                  g.items?.length
                    ? g.items.map((i) => renderModuleLink(i.label, i.href, i.icon ?? g.icon))
                    : g.href
                      ? [renderModuleLink(g.label, g.href, g.icon)]
                      : []
                )
              : visibleModules.map((g) => {
                  if (!g.items?.length) {
                    return g.href ? renderModuleLink(g.label, g.href, g.icon) : null
                  }
                  // A module may declare several top-level groups, so the key
                  // has to include the group label — `g.name` alone collides.
                  const key = `module:${g.name}:${g.label}`
                  const open = !!openParents[key]
                  const childActive = g.items.some((i) => i.href === activeModuleHref)
                  const GroupIcon = phosphorIconByName(g.icon)
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        onClick={() => toggleParent(key)}
                        aria-expanded={open}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors',
                          childActive
                            ? 'text-sidebar-foreground font-medium'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                        )}
                      >
                        <GroupIcon
                          weight={childActive ? 'duotone' : 'regular'}
                          className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110"
                        />
                        <span className="truncate">{g.label}</span>
                        <CaretDown
                          className={cn(
                            'ml-auto size-4 shrink-0 transition-transform duration-200',
                            open ? '' : '-rotate-90'
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          'grid transition-[grid-template-rows] duration-200 ease-out',
                          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-2">
                            {g.items.map((i) => renderModuleLink(i.label, i.href, i.icon))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
          </Fragment>
        )}

        {/* Dynamic collections, grouped by each collection's `group` value */}
        {collectionSections.map((section) => (
          <Fragment key={section.key}>
            {sectionHeader(section.label)}
            {section.cols.map((col) => {
              const href = `/admin/cms/${col.key}`
              const active = isActive(pathname, { href, activeMatch: 'prefix' })
              return (
                <Link
                  key={col.id}
                  href={href}
                  className={rowClasses(active, collapsed)}
                  title={collapsed ? col.label : undefined}
                >
                  {active && !collapsed && <ActiveBar />}
                  {col.icon?.trim() ? (
                    <CollectionMenuIcon icon={col.icon} className="size-[18px] shrink-0" />
                  ) : (
                    <Boxes className="size-[18px] shrink-0" />
                  )}
                  {!collapsed && <span className="truncate">{col.label}</span>}
                </Link>
              )
            })}
          </Fragment>
        ))}
      </nav>

      {/* Footer — account chip + sign out */}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        {collapsed ? (
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title="Log out"
            aria-label="Log out"
          >
            <SignOut className="size-[18px] shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/15 text-[11px] font-medium text-sidebar-active-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
              <p className="truncate text-xs capitalize text-sidebar-foreground/50">{roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              title="Log out"
              aria-label="Log out"
            >
              <SignOut className="size-[18px] shrink-0" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
