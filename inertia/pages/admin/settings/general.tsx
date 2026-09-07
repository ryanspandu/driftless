import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical, Lock } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Switch } from '~/components/ui/switch'
import { BackButton } from '~/components/admin/back-button'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { useWebsiteSettings, useUpdateWebsiteSettings } from '~/hooks/api/use-website-settings'

/**
 * The core sidebar nav, described by title so this page can reorder and hide it.
 *
 * Kept in step by hand with `navEntries` in `~/components/admin/sidebar.tsx` and
 * `PATH_NAV` in `app/middleware/nav_enabled_middleware.ts` — all three key on
 * the same title strings. `pinned` (Dashboard/Settings) can't be moved or hidden
 * (hiding Settings would remove the only way back here); `hideable` entries get
 * a visibility toggle; parents list the child titles that can be reordered.
 */
const CORE_NAV: {
  title: string
  pinned?: boolean
  hideable?: boolean
  children?: string[]
}[] = [
  { title: 'Dashboard', pinned: true },
  { title: 'Analytics', hideable: true },
  { title: 'Forms' },
  {
    title: 'UI',
    hideable: true,
    children: ['Content', 'Pages', 'Templates', 'Menus', 'Website settings', 'Redirects'],
  },
  { title: 'Media', hideable: true },
  { title: 'Collections', hideable: true },
  { title: 'Components' },
  { title: 'User Management', hideable: true, children: ['Users', 'Roles', 'Permissions'] },
  { title: 'Settings', pinned: true },
]

const MIDDLE = CORE_NAV.filter((n) => !n.pinned)
const MIDDLE_TITLES = MIDDLE.map((n) => n.title)
const PARENTS = CORE_NAV.filter((n) => n.children)
const BY_TITLE = new Map(CORE_NAV.map((n) => [n.title, n]))

/** Saved order first (known titles only), then any titles it did not mention. */
function mergeOrder(saved: string[] | undefined, defaults: string[]): string[] {
  const kept = (saved ?? []).filter((t) => defaults.includes(t))
  return [...kept, ...defaults.filter((t) => !kept.includes(t))]
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description?: string | null
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

/** A draggable row shell — provides the grip handle and drag transform. */
function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="rounded-lg border border-border bg-card"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

function ChildList({ order, onReorder }: { order: string[]; onReorder: (next: string[]) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(order, from, to))
  }
  return (
    <div className="ml-9 mt-1 space-y-1 border-l border-border pl-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((title) => (
            <SortableRow key={title} id={title}>
              <span className="flex-1 truncate text-sm">{title}</span>
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

function NavArranger() {
  const { data } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const appCfg = useMemo(() => data?.sections?.['app_config'] ?? {}, [data])

  const savedOrder = useMemo<Record<string, string[]>>(() => {
    try {
      const parsed = JSON.parse(appCfg['nav_order'] ?? '{}')
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }, [appCfg])

  const hidden = useMemo(
    () =>
      new Set(
        (appCfg['hidden_nav'] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [appCfg]
  )

  const [rootOrder, setRootOrder] = useState<string[]>(MIDDLE_TITLES)
  const [childOrder, setChildOrder] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const seeded = useRef(false)

  // Seed local state once the settings load; keep local edits across the refetch
  // a save triggers.
  useEffect(() => {
    if (!data || seeded.current) return
    seeded.current = true
    setRootOrder(mergeOrder(savedOrder.root, MIDDLE_TITLES))
    const next: Record<string, string[]> = {}
    for (const p of PARENTS) next[p.title] = mergeOrder(savedOrder[p.title], p.children!)
    setChildOrder(next)
  }, [data, savedOrder])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const persist = (root: string[], children: Record<string, string[]>) => {
    update.mutate({
      patches: [
        { section: 'app_config', key: 'nav_order', value: JSON.stringify({ root, ...children }) },
      ],
    })
  }

  const onRootDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = rootOrder.indexOf(String(active.id))
    const to = rootOrder.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(rootOrder, from, to)
    setRootOrder(next)
    persist(next, childOrder)
  }

  const onChildReorder = (parent: string) => (next: string[]) => {
    const merged = { ...childOrder, [parent]: next }
    setChildOrder(merged)
    persist(rootOrder, merged)
  }

  const toggleHidden = (title: string, visible: boolean) => {
    const next = new Set(hidden)
    if (visible) next.delete(title)
    else next.add(title)
    // An empty string makes `applyPatches` drop the override row entirely.
    update.mutate({
      patches: [{ section: 'app_config', key: 'hidden_nav', value: Array.from(next).join(',') }],
    })
  }

  const toggle = (title: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })

  const pinnedRow = (title: string) => (
    <div
      key={title}
      className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5"
    >
      <Lock className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="flex-1 truncate text-sm font-medium">{title}</span>
      <span className="text-[11px] text-muted-foreground">Always shown</span>
    </div>
  )

  return (
    <div className="space-y-2">
      {pinnedRow('Dashboard')}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onRootDragEnd}>
        <SortableContext items={rootOrder} strategy={verticalListSortingStrategy}>
          {rootOrder.map((title) => {
            const meta = BY_TITLE.get(title)
            const hasChildren = !!meta?.children?.length
            const isOpen = expanded.has(title)
            return (
              <div key={title}>
                <SortableRow id={title}>
                  <span className="flex-1 truncate text-sm font-medium">{title}</span>
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggle(title)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      <ChevronDown
                        className={cn('size-4 transition-transform', isOpen ? '' : '-rotate-90')}
                      />
                    </button>
                  ) : null}
                  {meta?.hideable ? (
                    <Switch
                      checked={!hidden.has(title)}
                      disabled={update.isPending}
                      onCheckedChange={(v) => toggleHidden(title, v)}
                      aria-label={`Show ${title}`}
                    />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Always shown</span>
                  )}
                </SortableRow>
                {hasChildren && isOpen ? (
                  <ChildList
                    order={childOrder[title] ?? meta!.children!}
                    onReorder={onChildReorder(title)}
                  />
                ) : null}
              </div>
            )
          })}
        </SortableContext>
      </DndContext>

      {pinnedRow('Settings')}
    </div>
  )
}

/**
 * Both sections write to the same `app_config` settings section through one
 * mutation, which is why they are not split into panel components.
 */
function GeneralSettings() {
  const { data } = useWebsiteSettings()
  const update = useUpdateWebsiteSettings()
  const appCfg = data?.sections?.['app_config'] ?? {}
  const landingEnabled = (appCfg['landing_enabled'] ?? '1') !== '0'
  const registrationEnabled = (appCfg['registration_enabled'] ?? '0') === '1'

  const patch = (key: string, value: string) =>
    update.mutate({ patches: [{ section: 'app_config', key, value }] })

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Public site</h2>
          <p className="text-xs text-muted-foreground">
            Turn the public-facing site on or off for a dashboard-only SAAS.
          </p>
        </div>
        <ToggleRow
          title="Landing page & public pages"
          description="When off, the landing and public posts redirect to the dashboard / login."
          checked={landingEnabled}
          disabled={update.isPending}
          onChange={(on) => patch('landing_enabled', on ? '1' : '0')}
        />
        <ToggleRow
          title="Public sign-up"
          description="Let anyone create an account at /register. New accounts get the MEMBER role, which holds no permissions — grant capabilities explicitly. Off by default."
          checked={registrationEnabled}
          disabled={update.isPending}
          onChange={(on) => patch('registration_enabled', on ? '1' : '0')}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Sidebar menus</h2>
          <p className="text-xs text-muted-foreground">
            Drag to reorder the sidebar. Toggle a menu off to hide it (its pages return 404).
            Dashboard and Settings always stay. Expand a menu to reorder its sub-items.
          </p>
        </div>
        <NavArranger />
      </section>
    </div>
  )
}

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <PageHeader
          title="General"
          subtitle="Turn the public site on or off, and arrange the sidebar menus."
          className="flex-1"
        />
      </div>
      <Can
        permission="settings:manage"
        fallback={
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage application settings.
          </p>
        }
      >
        <GeneralSettings />
      </Can>
    </div>
  )
}
