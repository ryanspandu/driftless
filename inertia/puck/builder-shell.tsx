import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Puck, createUsePuck, type Data } from '@measured/puck'
import { router } from '@inertiajs/react'
import {
  Blocks,
  ChevronDown,
  Globe,
  Layers,
  Monitor,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Redo2,
  Search,
  Settings,
  Smartphone,
  SlidersHorizontal,
  Square,
  Tablet,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { LayersTree } from './layers-tree'
import { DetailPanel } from './detail-panel'
import { SettingsDialog, type PageMeta } from './settings-dialog'
import {
  BASE_BREAKPOINT_ID,
  BreakpointContext,
  DEFAULT_BREAKPOINTS,
  baseBreakpoint,
  breakpointForWidth,
  orderBreakpoints,
  type Breakpoint,
} from './breakpoints'

/**
 * Selector-scoped Puck store hook. Every consumer here subscribes to a NARROW
 * slice (a primitive or a stable reference) instead of `usePuck()` (which
 * subscribes to the whole store `(s) => s` and re-renders on every change, incl.
 * hover/selection). This keeps the toolbar, panels and layers from re-rendering
 * together on unrelated store ticks — the dominant editor-lag multiplier.
 */
const usePuckStore = createUsePuck()

/**
 * Count Image blocks that have a source but no alt text, anywhere in the doc
 * (content + zones). Powers the accessibility nudge in the toolbar — decorative
 * images can legitimately have empty alt, so this warns rather than blocks.
 */
function countMissingAlt(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, child) => n + countMissingAlt(child), 0)
  if (!node || typeof node !== 'object') return 0
  const block = node as { type?: string; props?: Record<string, unknown> }
  let count = 0
  if (block.type === 'Image') {
    const src = block.props?.src
    const url = typeof src === 'string' ? src : (src as { url?: string } | undefined)?.url
    const alt = typeof block.props?.alt === 'string' ? (block.props.alt as string).trim() : ''
    if (url && !alt) count += 1
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    count += countMissingAlt(value)
  }
  return count
}

/**
 * Custom Puck layout for the Pages/Templates builder.
 *
 *   LEFT   = tabs [ Components | Detail ]  (Puck's drawer + the selected field panel)
 *   CENTER = canvas (Puck.Preview), width-constrained by the device switcher
 *   RIGHT  = Layers (always visible — clicking a layer selects it but never hides
 *            the tree, which was the whole point of moving it here)
 *
 * We compose Puck's sub-components directly (`children` mode) instead of the
 * `fields`/`outline` overrides, because those are position-locked and feed
 * `Puck.Fields`/`Puck.Outline`. The trade-off is rebuilding the toolbar
 * (undo/redo + Publish + the device switcher) ourselves.
 *
 * Canvas sizing is done by constraining the preview wrapper width — NOT via
 * Puck's viewport system, which is gated behind `iframe.enabled` (off here, since
 * the iframe froze the editor). Device presets use the most common real widths.
 */

/**
 * Filter Puck's component drawer by a search query, in place.
 *
 * Puck's `<Puck.Components />` has no search of its own. Each category renders a
 * 3-column grid (`_Drawer_`) whose direct children are the tile cells; the
 * draggable itself (`_Drawer-draggable_`) sits *inside* a cell. We must hide the
 * CELL, not the draggable — hiding only the draggable leaves an empty grid cell,
 * which pushed a lone result into the middle column. Hiding the cell removes it
 * from the grid so matches pack to the left. A category (`_ComponentList_`) with
 * no visible cell is collapsed. We only toggle `display`, so drag-and-drop on the
 * surviving tiles is untouched; an empty query restores everything. Selectors are
 * Puck-internal substrings — if they ever change the filter simply no-ops.
 */
function filterComponentDrawer(root: HTMLElement, query: string) {
  const q = query.trim().toLowerCase()
  const grids = root.querySelectorAll<HTMLElement>('[class*="_Drawer_"]')
  const categories = root.querySelectorAll<HTMLElement>('[class*="_ComponentList_"]')

  grids.forEach((grid) => {
    for (const cell of Array.from(grid.children) as HTMLElement[]) {
      const match = !q || (cell.textContent ?? '').toLowerCase().includes(q)
      cell.style.display = match ? '' : 'none'
    }
  })
  categories.forEach((c) => {
    if (!q) {
      c.style.display = ''
      return
    }
    const grid = c.querySelector<HTMLElement>('[class*="_Drawer_"]')
    const anyVisible = grid
      ? (Array.from(grid.children) as HTMLElement[]).some((cell) => cell.style.display !== 'none')
      : false
    c.style.display = anyVisible ? '' : 'none'
  })
}

/**
 * Pick a glyph for a breakpoint. Custom resolutions get a plain square (they are
 * not a standard device); the built-in tiers get a matching device icon.
 */
function iconForBreakpoint(bp: Breakpoint): ComponentType<{ className?: string }> {
  if (bp.custom) return Square
  if (bp.maxWidth === null) return Monitor
  if (bp.maxWidth <= 480) return Smartphone
  if (bp.maxWidth <= 900) return Tablet
  return Monitor
}

export function BuilderShell({
  topbarStart,
  topbarEnd,
  onPublish,
  onAutosave,
  hasDraft = false,
  onDiscardDraft,
  pageMeta,
  onPageMetaChange,
  breakpoints = DEFAULT_BREAKPOINTS,
  onBreakpointsChange,
}: {
  topbarStart?: ReactNode
  topbarEnd?: ReactNode
  onPublish: (data: Data) => void | Promise<void>
  /** Debounced autosave to a draft (design + SEO). Omitted by the Templates builder. */
  onAutosave?: (data: Data, seo: Record<string, unknown>) => Promise<void>
  /** Whether a staged (unpublished) draft already exists for this page. */
  hasDraft?: boolean
  /** Discard the staged draft (the editor reloads onto the live design). */
  onDiscardDraft?: () => void | Promise<void>
  /** Page-level settings — omitted by the Templates builder. */
  pageMeta?: PageMeta
  onPageMetaChange?: (meta: PageMeta) => void
  /** Site-wide responsive tiers (base + custom); defaults to mobile/tablet/desktop. */
  breakpoints?: Breakpoint[]
  /** Persist an edited tier list (add/remove custom resolutions). */
  onBreakpointsChange?: (next: Breakpoint[]) => void
}) {
  // The document reference: replaced synchronously by the reducer on every
  // content edit, never touched by hover/selection (those are ui-only) — so this
  // re-renders the shell per content commit (already debounced) but not on hover.
  const data = usePuckStore((s) => s.appState.data)
  const hasPast = usePuckStore((s) => s.history.hasPast)
  const hasFuture = usePuckStore((s) => s.history.hasFuture)
  const undo = usePuckStore((s) => s.history.back)
  const redo = usePuckStore((s) => s.history.forward)
  const selId = usePuckStore(
    (s) => (s.selectedItem?.props as { id?: string } | undefined)?.id ?? null
  )
  const [leftTab, setLeftTab] = useState<'components' | 'element'>('components')
  const [componentQuery, setComponentQuery] = useState('')
  const componentsRef = useRef<HTMLDivElement>(null)

  // Keep the component drawer filtered to the search query. A MutationObserver
  // re-applies it whenever Puck re-renders the drawer (e.g. expanding a category
  // or after a drag), so the filter stays sticky while typing.
  useEffect(() => {
    const root = componentsRef.current
    if (!root || leftTab !== 'components') return
    // Always apply the current query once (this also RESETS every tile to visible
    // when the query is cleared).
    filterComponentDrawer(root, componentQuery)
    // Only keep an observer alive while there is an ACTIVE search to stay sticky.
    // With no query there is nothing to hide, so skip it entirely — otherwise the
    // drawer DOM mutations dnd-kit makes during a drag would fire a full-drawer
    // sweep every frame for no reason.
    if (!componentQuery.trim()) return
    // Coalesce mutation bursts into a single rAF-batched re-filter.
    let raf = 0
    const observer = new MutationObserver(() => {
      if (raf) return
      // Never re-filter mid-drag. Dragging a component from the drawer makes
      // dnd-kit mutate the drawer, which fires this observer; re-applying the
      // per-cell `display` toggles on every frame perturbs dnd-kit's cached
      // measurements and can abort the drag — which is why a searched-for block
      // (buried in a category, reached by typing, so the observer is live)
      // could not be dropped while top-of-drawer blocks (no search) dragged
      // fine. Puck sets `data-puck-dragging` on `[data-puck-entry]` for the
      // duration of a drag, and re-renders the drawer on drop, which re-fires
      // this observer with the flag gone and restores the filter.
      if (document.querySelector('[data-puck-dragging]')) return
      raf = requestAnimationFrame(() => {
        raf = 0
        filterComponentDrawer(root, componentQuery)
      })
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [componentQuery, leftTab])
  // null = Desktop / full width. A number = a fixed canvas width in px (preset
  // or a custom value typed into the width box).
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null)
  // The breakpoint tier currently being previewed/edited. Selecting a tier sets
  // both this and the canvas width; it drives which layer the Detail panel writes
  // to and which layer `Box` flattens for the canvas preview.
  const [activeBp, setActiveBp] = useState<string>(
    baseBreakpoint(breakpoints)?.id ?? BASE_BREAKPOINT_ID
  )
  // Selecting a breakpoint moves the canvas to its width AND makes it the edit
  // target; typing a free width keeps editing in sync by matching it to a tier.
  const selectBreakpoint = (bp: Breakpoint) => {
    setCanvasWidth(bp.maxWidth)
    setActiveBp(bp.id)
  }
  const setCustomWidth = (w: number | null) => {
    setCanvasWidth(w)
    setActiveBp(breakpointForWidth(breakpoints, w))
  }
  // Memoised so the canvas Boxes (context consumers) only re-render when the tier
  // or list actually changes — not on every unrelated shell render.
  const bpContext = useMemo(() => ({ breakpoints, activeBp }), [breakpoints, activeBp])

  // Add a new site-wide custom resolution with a chosen name + width.
  const addCustomBreakpoint = (label: string, width: number) => {
    if (!onBreakpointsChange || !Number.isFinite(width) || width <= 0) return
    const existing = breakpoints.find((b) => b.maxWidth === width)
    if (existing) {
      setActiveBp(existing.id)
      setCanvasWidth(width)
      return
    }
    let id = `bp${width}`
    let n = 1
    while (breakpoints.some((b) => b.id === id)) id = `bp${width}_${n++}`
    onBreakpointsChange([
      ...breakpoints,
      { id, label: label.trim() || `${width}px`, maxWidth: width, custom: true },
    ])
    setActiveBp(id)
    setCanvasWidth(width)
  }
  // Rename / resize an existing custom tier. The id stays stable so any element
  // overrides already stored against it keep applying.
  const updateBreakpoint = (id: string, label: string, width: number) => {
    if (!onBreakpointsChange || !Number.isFinite(width) || width <= 0) return
    onBreakpointsChange(
      breakpoints.map((b) =>
        b.id === id ? { ...b, label: label.trim() || `${width}px`, maxWidth: width } : b
      )
    )
    setActiveBp(id)
    setCanvasWidth(width)
  }
  const removeBreakpoint = (id: string) => {
    if (!onBreakpointsChange) return
    onBreakpointsChange(breakpoints.filter((b) => b.id !== id))
    setActiveBp(baseBreakpoint(breakpoints)?.id ?? BASE_BREAKPOINT_ID)
    setCanvasWidth(null)
  }
  const activeBpObj = breakpoints.find((b) => b.id === activeBp)
  const activeIsCustom = activeBpObj?.custom === true
  const widthIsSaved = canvasWidth !== null && breakpoints.some((b) => b.maxWidth === canvasWidth)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // When a component is selected, swing the LEFT panel to Element so its settings
  // are right there. The Layers panel (right) is untouched.
  const prevSel = useRef<string | null>(selId)
  useEffect(() => {
    if (selId === prevSel.current) return
    prevSel.current = selId
    if (selId) setLeftTab('element')
  }, [selId])

  /**
   * Keep the selection overlay glued to the element after a breakpoint switch.
   *
   * Switching tiers moves/resizes the selected element (new canvas width + newly
   * flattened styles), but Puck only re-measures its selection overlay when
   * hover/selection *changes*, not on a plain layout shift — so the highlight was
   * left at the element's old position until you clicked it again. Dispatching a
   * real `mouseover` on the element (found by Puck's `data-puck-component` id)
   * drives Puck's hover path, which re-runs its own `sync()` and snaps the overlay
   * to the new box; the paired `mouseout` clears the transient hover state.
   */
  const selIdRef = useRef(selId)
  useEffect(() => {
    selIdRef.current = selId
  }, [selId])
  useEffect(() => {
    const resync = () => {
      const sid = selIdRef.current
      if (!sid) return
      const el = document.querySelector(`[data-puck-component="${CSS.escape(sid)}"]`)
      if (!el) return
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      requestAnimationFrame(() => el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })))
    }
    const raf = requestAnimationFrame(resync)
    return () => cancelAnimationFrame(raf)
  }, [activeBp, canvasWidth])

  /**
   * Unsaved-changes guard.
   *
   * Nothing in this editor autosaves — the design only reaches the server on
   * Publish — so closing the tab or clicking the breadcrumb back to Pages threw
   * away everything since the last publish, silently.
   *
   * Dirtiness is the current document *reference* against the last saved one.
   * `appState.data` is replaced (not mutated) on every edit, so `data !== saved`
   * is O(1) — where the old whole-document `JSON.stringify` on every edit was O(n)
   * in block count and a real contributor to the editor lag. (This over-reports in
   * one harmless case — undoing all the way back to the saved state still reads
   * dirty — which only ever prompts an unneeded confirm; it never loses work.
   * Puck's own history recording is debounced, so a history-index check could
   * *under*-report right after an edit, which would.)
   *
   * Page settings count too: title, path and SEO are edited in the dialog and
   * ride along on the same Publish, so they are just as losable as the blocks —
   * tracked with a tiny (O(1)-sized) JSON compare of the small meta object.
   */
  // Accessibility nudge: images without alt text. Computed on a DEFERRED copy of
  // the doc so the tree walk never runs inside a drag frame — the badge just
  // updates a beat after the drop.
  const deferredData = useDeferredValue(data)
  const missingAlt = useMemo(
    () => countMissingAlt((deferredData as { content?: unknown }).content),
    [deferredData]
  )

  const metaJson = useMemo(() => JSON.stringify(pageMeta ?? null), [pageMeta])
  const [savedData, setSavedData] = useState(data)
  const [savedMeta, setSavedMeta] = useState(metaJson)
  const dirty = data !== savedData || metaJson !== savedMeta

  /**
   * Autosave to a draft. Debounced on idle; the live page is never touched (the
   * server writes only the draft columns). A ref of the last-autosaved snapshot
   * stops it re-firing when nothing new has changed since.
   */
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    hasDraft ? 'saved' : 'idle'
  )
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [publishMenuOpen, setPublishMenuOpen] = useState(false)
  const lastAutosaved = useRef<{ data: Data; meta: string } | null>(null)
  useEffect(() => {
    if (!onAutosave || !dirty) return
    const snap = lastAutosaved.current
    if (snap && snap.data === data && snap.meta === metaJson) return
    const t = window.setTimeout(async () => {
      setSaveState('saving')
      try {
        await onAutosave(data, (pageMeta?.seo ?? {}) as Record<string, unknown>)
        lastAutosaved.current = { data, meta: metaJson }
        setSaveState('saved')
        setSavedAt(new Date())
      } catch {
        setSaveState('error')
      }
    }, 1500)
    return () => window.clearTimeout(t)
  }, [data, metaJson, dirty, onAutosave, pageMeta])

  useEffect(() => {
    if (!dirty) return

    // Full navigations (tab close, reload, "View live") — the browser shows its
    // own generic prompt; the text is not ours to choose.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    // Inertia visits (the back link) never fire `beforeunload`, so they need
    // their own confirmation or the guard would only cover half the exits.
    const offInertia = router.on('before', (event) => {
      if (!window.confirm('You have unsaved changes. Leave without publishing?')) {
        event.preventDefault()
      }
    })

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      offInertia()
    }
  }, [dirty])

  /**
   * Publish, then mark the document clean — but only if it actually saved.
   * The callers surface their own error toast and rethrow, so a failed save
   * leaves the page dirty and still guarded.
   */
  const publish = async () => {
    const attemptedData = data
    const attemptedMeta = metaJson
    try {
      await onPublish(attemptedData)
      setSavedData(attemptedData)
      setSavedMeta(attemptedMeta)
      // The draft was promoted; forget the autosave snapshot so a later edit
      // re-arms autosave from a clean slate.
      lastAutosaved.current = { data: attemptedData, meta: attemptedMeta }
      setSaveState('idle')
    } catch {
      // Already reported by the caller; keep the unsaved state.
    }
  }

  return (
    // Shares the active breakpoint + tier list with the Detail panel (edit target)
    // AND every Box in the canvas (preview flatten). The device switcher reads the
    // shell's own state directly, so it lives outside the value it drives.
    <BreakpointContext.Provider value={bpContext}>
      {/* `data-builder` scopes the brand focus ring to the editor chrome — see app.css. */}
      <div data-builder className="flex h-screen flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">{topbarStart}</div>

          {/* Device / canvas-size switcher (centered) */}
          <TooltipProvider delay={250}>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                {orderBreakpoints(breakpoints).map((bp) => {
                  const Icon = iconForBreakpoint(bp)
                  const active = bp.id === activeBp
                  const label =
                    bp.maxWidth === null ? `${bp.label} (full)` : `${bp.label} (${bp.maxWidth}px)`
                  return (
                    <Tooltip key={bp.id}>
                      <TooltipTrigger
                        type="button"
                        aria-label={label}
                        aria-pressed={active}
                        onClick={() => selectBreakpoint(bp)}
                        className={cn(
                          'flex size-7 items-center justify-center rounded transition-colors',
                          active
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Icon className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>{label}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={canvasWidth ?? ''}
                  placeholder="Auto"
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10)
                    setCustomWidth(Number.isFinite(v) && v > 0 ? v : null)
                  }}
                  className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
                  aria-label="Custom canvas width (px)"
                />
                <span className="text-xs text-muted-foreground">px</span>
                {onBreakpointsChange && (
                  <BreakpointPopover
                    submitLabel="Add"
                    initialWidth={widthIsSaved ? null : canvasWidth}
                    onSubmit={addCustomBreakpoint}
                    trigger={
                      <button
                        type="button"
                        title="Add a named custom resolution"
                        aria-label="Add custom resolution"
                        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      />
                    }
                  >
                    <Plus className="size-4" />
                  </BreakpointPopover>
                )}
                {onBreakpointsChange && activeIsCustom && activeBpObj && (
                  <BreakpointPopover
                    submitLabel="Save"
                    initialLabel={activeBpObj.label}
                    initialWidth={activeBpObj.maxWidth}
                    onSubmit={(l, w) => updateBreakpoint(activeBpObj.id, l, w)}
                    onDelete={() => removeBreakpoint(activeBpObj.id)}
                    trigger={
                      <button
                        type="button"
                        title={`Rename or resize “${activeBpObj.label}”`}
                        aria-label="Edit custom resolution"
                        className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      />
                    }
                  >
                    <Pencil className="size-3.5" />
                  </BreakpointPopover>
                )}
              </div>
            </div>
          </TooltipProvider>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-8',
                  leftOpen ? 'bg-muted text-foreground' : 'text-muted-foreground'
                )}
                aria-pressed={leftOpen}
                onClick={() => setLeftOpen((v) => !v)}
                aria-label="Toggle left panel"
              >
                <PanelLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-8',
                  rightOpen ? 'bg-muted text-foreground' : 'text-muted-foreground'
                )}
                aria-pressed={rightOpen}
                onClick={() => setRightOpen((v) => !v)}
                aria-label="Toggle right panel"
              >
                <PanelRight className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setSettingsOpen(true)}
                aria-label="Page settings"
              >
                <Settings className="size-4" />
              </Button>
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!hasPast}
                onClick={() => undo()}
                aria-label="Undo"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!hasFuture}
                onClick={() => redo()}
                aria-label="Redo"
              >
                <Redo2 className="size-4" />
              </Button>
            </div>
            {/* The alt-text nudge stays out in the toolbar; everything else moves
                into the Publish dropdown. */}
            {missingAlt > 0 ? (
              <span
                className="shrink-0 whitespace-nowrap rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
                title={`${missingAlt} image${missingAlt > 1 ? 's' : ''} missing alt text. Add alt for screen-reader users (leave empty only for decorative images).`}
              >
                {missingAlt} missing alt
              </span>
            ) : null}

            <Popover open={publishMenuOpen} onOpenChange={setPublishMenuOpen}>
              <PopoverTrigger
                className="relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                aria-label="Publish menu"
              >
                <Globe className="size-3.5" />
                Publish
                <ChevronDown className="size-3.5 opacity-80" />
                {/* Amber dot: there are changes not yet published. */}
                {dirty || hasDraft ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-background"
                    aria-hidden
                  />
                ) : null}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-1.5">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {saveState === 'saving'
                    ? 'Saving draft…'
                    : saveState === 'error'
                      ? 'Autosave failed — edit to retry'
                      : saveState === 'saved'
                        ? `Draft saved${savedAt ? ` at ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
                        : dirty
                          ? 'Unsaved changes'
                          : hasDraft
                            ? 'Unpublished draft'
                            : 'Published — up to date'}
                </div>
                <div className="my-1 h-px bg-border" />
                {/* Page actions (History / Preview / View live) + Discard. Any
                    click closes the menu. */}
                <div className="flex flex-col" onClick={() => setPublishMenuOpen(false)}>
                  {topbarEnd}
                  {onDiscardDraft && (hasDraft || saveState === 'saved') ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Discard the unpublished draft and revert to the live page?'
                          )
                        ) {
                          void onDiscardDraft()
                        }
                      }}
                    >
                      <Trash2 className="size-4" /> Discard draft
                    </button>
                  ) : null}
                </div>
                <div className="my-1 h-px bg-border" />
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => {
                    setPublishMenuOpen(false)
                    void publish()
                  }}
                >
                  <Globe className="size-4" />
                  Publish now
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {leftOpen && (
            <aside className="flex w-72 shrink-0 flex-col border-r bg-background">
              <div className="shrink-0 border-b p-2">
                <div className="flex gap-1">
                  <TabButton
                    active={leftTab === 'components'}
                    onClick={() => setLeftTab('components')}
                  >
                    <Blocks className="size-4" />
                    Components
                  </TabButton>
                  <TabButton active={leftTab === 'element'} onClick={() => setLeftTab('element')}>
                    <SlidersHorizontal className="size-4" />
                    Element
                  </TabButton>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {leftTab === 'components' ? (
                  <div className="p-3">
                    <div className="relative mb-3">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={componentQuery}
                        onChange={(e) => setComponentQuery(e.target.value)}
                        placeholder="Search components…"
                        aria-label="Search components"
                        className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      {componentQuery ? (
                        <button
                          type="button"
                          onClick={() => setComponentQuery('')}
                          aria-label="Clear search"
                          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div ref={componentsRef}>
                      <Puck.Components />
                    </div>
                  </div>
                ) : (
                  <DetailPanel />
                )}
              </div>
            </aside>
          )}

          {/*
           * Emulated device viewport, in two nested layers, because the canvas renders
           * in the host document (no iframe — see file header) so `position: fixed`
           * would otherwise escape to the WINDOW and pin above the toolbar:
           *
           *   .frame  — device-width box that is the containing block for `fixed`/
           *             `sticky` (via `transform: translateZ(0)`) but does NOT scroll
           *             (`h-full` + `overflow-hidden`). Because it holds still, fixed
           *             descendants PIN to it, and because it is exactly the device
           *             width, they are BOUNDED to the page (no spill into the gutters,
           *             the "kelewat batas" bug). A transformed *scrolling* box can't do
           *             both — its fixed children would scroll away with the content.
           *   .scroll — the real scrollport for page content, nested inside the frame.
           *
           * <main> keeps only horizontal scroll, for a custom width wider than it.
           * Editor-only: the published page has no such ancestor, so `fixed`/`sticky`
           * behave normally against the real viewport there.
           */}
          <main className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden bg-muted/30 p-4">
            <div
              className="theme-light relative mx-auto h-full overflow-hidden bg-background shadow-sm"
              style={{
                width: canvasWidth ? `${canvasWidth}px` : '100%',
                transform: 'translateZ(0)',
              }}
            >
              <div className="h-full overflow-auto">
                <Puck.Preview />
              </div>
            </div>
          </main>

          {rightOpen && (
            <aside className="flex w-72 shrink-0 flex-col border-l bg-background">
              <div className="flex shrink-0 items-center gap-1.5 border-b p-3 text-sm font-medium">
                <Layers className="size-4" />
                Layers
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <LayersTree />
              </div>
            </aside>
          )}
        </div>

        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pageMeta={pageMeta}
          onPageMetaChange={onPageMetaChange}
        />
      </div>
    </BreakpointContext.Provider>
  )
}

/**
 * Small popover to add or edit a custom resolution: a name + a width. Reused for
 * both — an `onDelete` turns it into an edit form (with a Delete action), while
 * add mode pre-fills the width from the current preview.
 */
function BreakpointPopover({
  trigger,
  children,
  submitLabel,
  initialLabel = '',
  initialWidth = null,
  onSubmit,
  onDelete,
}: {
  trigger: ReactElement
  children: ReactNode
  submitLabel: string
  initialLabel?: string
  initialWidth?: number | null
  onSubmit: (label: string, width: number) => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(initialLabel)
  const [width, setWidth] = useState(initialWidth !== null ? String(initialWidth) : '')

  // Seed the fields from the latest props each time it opens (no effect needed).
  const openChange = (next: boolean) => {
    if (next) {
      setLabel(initialLabel)
      setWidth(initialWidth !== null ? String(initialWidth) : '')
    }
    setOpen(next)
  }

  const submit = () => {
    const w = Number.parseInt(width, 10)
    if (!Number.isFinite(w) || w <= 0) return
    onSubmit(label, w)
    setOpen(false)
  }
  const inputCls =
    'h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring'

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger render={trigger}>{children}</PopoverTrigger>
      <PopoverContent align="center" className="w-60 p-3">
        <div className="space-y-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Name</span>
            <input
              autoFocus
              value={label}
              placeholder="e.g. Laptop"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Width (px)</span>
            <input
              type="number"
              min={1}
              value={width}
              placeholder="e.g. 1024"
              onChange={(e) => setWidth(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className={cn(inputCls, 'tabular-nums')}
            />
          </label>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Styles set here apply at this width and narrower.
          </p>
          <div className="flex items-center justify-between pt-0.5">
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete()
                  setOpen(false)
                }}
                className="text-xs text-destructive hover:underline"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={submit}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
