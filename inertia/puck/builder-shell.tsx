import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Puck, usePuck, type Data } from '@measured/puck'
import { router } from '@inertiajs/react'
import {
  Blocks,
  Globe,
  Layers,
  Monitor,
  PanelLeft,
  PanelRight,
  Redo2,
  Settings,
  Smartphone,
  SlidersHorizontal,
  Tablet,
  Undo2,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { LayersTree } from './layers-tree'
import { DetailPanel } from './detail-panel'
import { SettingsDialog, type PageMeta } from './settings-dialog'

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

const DEVICE_PRESETS: {
  key: string
  label: string
  width: number | null
  icon: ComponentType<{ className?: string }>
}[] = [
  { key: 'mobile', label: 'Mobile (390px)', width: 390, icon: Smartphone },
  { key: 'tablet', label: 'Tablet (768px)', width: 768, icon: Tablet },
  { key: 'desktop', label: 'Desktop (full)', width: null, icon: Monitor },
]

export function BuilderShell({
  topbarStart,
  topbarEnd,
  onPublish,
  pageMeta,
  onPageMetaChange,
}: {
  topbarStart?: ReactNode
  topbarEnd?: ReactNode
  onPublish: (data: Data) => void | Promise<void>
  /** Page-level settings — omitted by the Templates builder. */
  pageMeta?: PageMeta
  onPageMetaChange?: (meta: PageMeta) => void
}) {
  const { appState, history, selectedItem } = usePuck()
  const [leftTab, setLeftTab] = useState<'components' | 'element'>('components')
  // null = Desktop / full width. A number = a fixed canvas width in px (preset
  // or a custom value typed into the width box).
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // When a component is selected, swing the LEFT panel to Element so its settings
  // are right there. The Layers panel (right) is untouched.
  const selId = (selectedItem?.props as { id?: string } | undefined)?.id ?? null
  const prevSel = useRef<string | null>(selId)
  useEffect(() => {
    if (selId === prevSel.current) return
    prevSel.current = selId
    if (selId) setLeftTab('element')
  }, [selId])

  /**
   * Unsaved-changes guard.
   *
   * Nothing in this editor autosaves — the design only reaches the server on
   * Publish — so closing the tab or clicking the breadcrumb back to Pages threw
   * away everything since the last publish, silently. Dirtiness is the current
   * document compared against the last one we successfully saved; `appState.data`
   * is replaced (not mutated) on every edit, so the serialisation is memoised on
   * its identity rather than run each render.
   *
   * Page settings count too: title, path and SEO are edited in the dialog and
   * ride along on the same Publish, so they are just as losable as the blocks.
   */
  const currentJson = useMemo(
    () => JSON.stringify({ data: appState.data, meta: pageMeta ?? null }),
    [appState.data, pageMeta]
  )
  const [savedJson, setSavedJson] = useState(currentJson)
  const dirty = currentJson !== savedJson

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
    const attempted = currentJson
    try {
      await onPublish(appState.data)
      setSavedJson(attempted)
    } catch {
      // Already reported by the caller; keep the unsaved state.
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">{topbarStart}</div>

        {/* Device / canvas-size switcher (centered) */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
            {DEVICE_PRESETS.map((d) => {
              const Icon = d.icon
              const active = canvasWidth === d.width
              return (
                <button
                  key={d.key}
                  type="button"
                  title={d.label}
                  aria-label={d.label}
                  aria-pressed={active}
                  onClick={() => setCanvasWidth(d.width)}
                  className={cn(
                    'flex size-7 items-center justify-center rounded transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                </button>
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
                setCanvasWidth(Number.isFinite(v) && v > 0 ? v : null)
              }}
              className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
              aria-label="Custom canvas width (px)"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-8', leftOpen ? 'bg-muted text-foreground' : 'text-muted-foreground')}
              aria-pressed={leftOpen}
              onClick={() => setLeftOpen((v) => !v)}
              aria-label="Toggle left panel"
            >
              <PanelLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-8', rightOpen ? 'bg-muted text-foreground' : 'text-muted-foreground')}
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
              disabled={!history.hasPast}
              onClick={() => history.back()}
              aria-label="Undo"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!history.hasFuture}
              onClick={() => history.forward()}
              aria-label="Redo"
            >
              <Redo2 className="size-4" />
            </Button>
          </div>
          {topbarEnd}
          {dirty ? (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title="This design has changes that are not published yet"
            >
              Unsaved
            </span>
          ) : null}
          <Button size="sm" className="gap-1.5" onClick={() => void publish()}>
            <Globe className="size-4" />
            Publish
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {leftOpen && (
        <aside className="flex w-72 shrink-0 flex-col border-r bg-background">
          <div className="shrink-0 border-b p-2">
            <div className="flex gap-1">
              <TabButton active={leftTab === 'components'} onClick={() => setLeftTab('components')}>
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
                <Puck.Components />
              </div>
            ) : (
              <DetailPanel />
            )}
          </div>
        </aside>
        )}

        <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted/30 p-4">
          <div
            className="theme-light mx-auto min-h-full bg-background shadow-sm transition-[width] duration-200"
            style={{ width: canvasWidth ? `${canvasWidth}px` : '100%' }}
          >
            <Puck.Preview />
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
