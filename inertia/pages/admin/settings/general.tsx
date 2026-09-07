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
import { useModulesMenu } from '~/hooks/api/use-modules'
import { useCmsCollectionsList } from '~/hooks/api/use-cms-collections'
import { buildCollectionSections } from '~/lib/collection_nav'

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

/**
 * A module's nav group identity — module name + label, matching
 * `moduleGroupKey` in `~/components/admin/sidebar.tsx`. Keep the two in step so
 * the order saved here is read back correctly there.
 */
const moduleGroupKey = (g: { name: string; label: string }) => `${g.name}:${g.label}`

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

/**
 * A nested drag-drop list of sub-items. Each item carries a stable `id` (the
 * reorder key that gets persisted) and a `label` to display — they differ for
 * collections, whose stable key is a slug but whose label is human text.
 * `onReorder` returns the new id order.
 */
function ChildList({
  items,
  onReorder,
}: {
  items: { id: string; label: string }[]
  onReorder: (nextIds: string[]) => void
}) {
  const order = items.map((i) => i.id)
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
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              <span className="flex-1 truncate text-sm">{item.label}</span>
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
  const moduleMenu = useModulesMenu()
  const moduleGroups = useMemo(() => moduleMenu.data ?? [], [moduleMenu.data])
  const collectionsQuery = useCmsCollectionsList()
  const collectionSections = useMemo(
    () => buildCollectionSections(collectionsQuery.data ?? []),
    [collectionsQuery.data]
  )
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
  // Apps section: module group order + per-group item order, both keyed by
  // `moduleGroupKey`. Seeded separately because the module menu is a distinct
  // query that can arrive after the settings.
  const [appsOrder, setAppsOrder] = useState<string[]>([])
  const [appItemOrder, setAppItemOrder] = useState<Record<string, string[]>>({})
  // Collections section: section (group) order + per-section collection order,
  // keyed by section.key and col.key. Seeded once collections load.
  const [collectionsOrder, setCollectionsOrder] = useState<string[]>([])
  const [collectionColOrder, setCollectionColOrder] = useState<Record<string, string[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const seeded = useRef(false)
  const appsSeeded = useRef(false)
  const collectionsSeeded = useRef(false)

  // Seed core nav order once the settings load; keep local edits across the
  // refetch a save triggers.
  useEffect(() => {
    if (!data || seeded.current) return
    seeded.current = true
    setRootOrder(mergeOrder(savedOrder.root, MIDDLE_TITLES))
    const next: Record<string, string[]> = {}
    for (const p of PARENTS) next[p.title] = mergeOrder(savedOrder[p.title], p.children!)
    setChildOrder(next)
  }, [data, savedOrder])

  // Seed the Apps order once both the settings and the module menu are in.
  useEffect(() => {
    if (!data || moduleGroups.length === 0 || appsSeeded.current) return
    appsSeeded.current = true
    setAppsOrder(mergeOrder(savedOrder.apps, moduleGroups.map(moduleGroupKey)))
    const items: Record<string, string[]> = {}
    for (const g of moduleGroups) {
      if (g.items?.length) {
        const key = moduleGroupKey(g)
        items[key] = mergeOrder(
          savedOrder[`app:${key}`],
          g.items.map((i) => i.label)
        )
      }
    }
    setAppItemOrder(items)
  }, [data, moduleGroups, savedOrder])

  const groupByKey = useMemo(
    () => new Map(moduleGroups.map((g) => [moduleGroupKey(g), g])),
    [moduleGroups]
  )

  // Seed the Collections order once both the settings and the collections are in.
  useEffect(() => {
    if (!data || collectionSections.length === 0 || collectionsSeeded.current) return
    collectionsSeeded.current = true
    setCollectionsOrder(
      mergeOrder(
        savedOrder.collections,
        collectionSections.map((s) => s.key)
      )
    )
    const cols: Record<string, string[]> = {}
    for (const s of collectionSections) {
      cols[s.key] = mergeOrder(
        savedOrder[`col:${s.key}`],
        s.cols.map((c) => c.key)
      )
    }
    setCollectionColOrder(cols)
  }, [data, collectionSections, savedOrder])

  const collectionSectionByKey = useMemo(
    () => new Map(collectionSections.map((s) => [s.key, s])),
    [collectionSections]
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Merge onto the last-saved order so a save from one section never wipes keys
  // another section owns but has not seeded yet (e.g. reordering core menus
  // before the module menu has loaded must not drop the saved Apps order).
  const persist = (over: {
    root?: string[]
    children?: Record<string, string[]>
    apps?: string[]
    appItems?: Record<string, string[]>
    collections?: string[]
    collectionCols?: Record<string, string[]>
  }) => {
    const payload: Record<string, string[]> = { ...savedOrder }
    payload.root = over.root ?? rootOrder
    for (const [k, v] of Object.entries(over.children ?? childOrder)) payload[k] = v
    const apps = over.apps ?? appsOrder
    if (apps.length > 0) payload.apps = apps
    for (const [k, v] of Object.entries(over.appItems ?? appItemOrder)) payload[`app:${k}`] = v
    const collections = over.collections ?? collectionsOrder
    if (collections.length > 0) payload.collections = collections
    for (const [k, v] of Object.entries(over.collectionCols ?? collectionColOrder))
      payload[`col:${k}`] = v
    update.mutate({
      patches: [{ section: 'app_config', key: 'nav_order', value: JSON.stringify(payload) }],
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
    persist({ root: next })
  }

  const onChildReorder = (parent: string) => (next: string[]) => {
    const merged = { ...childOrder, [parent]: next }
    setChildOrder(merged)
    persist({ children: merged })
  }

  const onAppsDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = appsOrder.indexOf(String(active.id))
    const to = appsOrder.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(appsOrder, from, to)
    setAppsOrder(next)
    persist({ apps: next })
  }

  const onAppItemsReorder = (key: string) => (next: string[]) => {
    const merged = { ...appItemOrder, [key]: next }
    setAppItemOrder(merged)
    persist({ appItems: merged })
  }

  const onCollectionsDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = collectionsOrder.indexOf(String(active.id))
    const to = collectionsOrder.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(collectionsOrder, from, to)
    setCollectionsOrder(next)
    persist({ collections: next })
  }

  const onCollectionColsReorder = (key: string) => (next: string[]) => {
    const merged = { ...collectionColOrder, [key]: next }
    setCollectionColOrder(merged)
    persist({ collectionCols: merged })
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
                    items={(childOrder[title] ?? meta!.children!).map((t) => ({ id: t, label: t }))}
                    onReorder={onChildReorder(title)}
                  />
                ) : null}
              </div>
            )
          })}
        </SortableContext>
      </DndContext>

      {pinnedRow('Settings')}

      {/* Apps — enabled modules' sidebar groups, ordered the same way. Renders
          after Settings because that is where the Apps section sits in the
          sidebar. Modules are enabled/disabled elsewhere, so there is no hide
          toggle here — reorder only. */}
      {appsOrder.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 pt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Apps
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onAppsDragEnd}
          >
            <SortableContext items={appsOrder} strategy={verticalListSortingStrategy}>
              {appsOrder.map((key) => {
                const group = groupByKey.get(key)
                if (!group) return null
                const hasChildren = !!group.items?.length
                const isOpen = expanded.has(key)
                return (
                  <div key={key}>
                    <SortableRow id={key}>
                      <span className="flex-1 truncate text-sm font-medium">{group.label}</span>
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(key)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={isOpen ? 'Collapse' : 'Expand'}
                        >
                          <ChevronDown
                            className={cn(
                              'size-4 transition-transform',
                              isOpen ? '' : '-rotate-90'
                            )}
                          />
                        </button>
                      ) : null}
                    </SortableRow>
                    {hasChildren && isOpen ? (
                      <ChildList
                        items={(appItemOrder[key] ?? group.items!.map((i) => i.label)).map((l) => ({
                          id: l,
                          label: l,
                        }))}
                        onReorder={onAppItemsReorder(key)}
                      />
                    ) : null}
                  </div>
                )
              })}
            </SortableContext>
          </DndContext>
        </div>
      ) : null}

      {/* Collections — dynamic CMS collections grouped into sidebar sections.
          Drag a section header to reorder groups, expand one to reorder the
          collections inside it. Collections are keyed by their stable slug, so
          renaming one keeps its saved position. */}
      {collectionsOrder.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 pt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Collections
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onCollectionsDragEnd}
          >
            <SortableContext items={collectionsOrder} strategy={verticalListSortingStrategy}>
              {collectionsOrder.map((key) => {
                const section = collectionSectionByKey.get(key)
                if (!section) return null
                const isOpen = expanded.has(key)
                const labelByColKey = new Map(section.cols.map((c) => [c.key, c.label]))
                const colIds = collectionColOrder[key] ?? section.cols.map((c) => c.key)
                return (
                  <div key={key}>
                    <SortableRow id={key}>
                      <span className="flex-1 truncate text-sm font-medium">{section.label}</span>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        aria-label={isOpen ? 'Collapse' : 'Expand'}
                      >
                        <ChevronDown
                          className={cn('size-4 transition-transform', isOpen ? '' : '-rotate-90')}
                        />
                      </button>
                    </SortableRow>
                    {isOpen ? (
                      <ChildList
                        items={colIds.map((ck) => ({ id: ck, label: labelByColKey.get(ck) ?? ck }))}
                        onReorder={onCollectionColsReorder(key)}
                      />
                    ) : null}
                  </div>
                )
              })}
            </SortableContext>
          </DndContext>
        </div>
      ) : null}
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
