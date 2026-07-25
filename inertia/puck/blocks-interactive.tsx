import { useState, type ComponentType } from 'react'
import { cn } from '~/lib/utils'
import { Box } from './style-fields'

/**
 * Interactive Advanced blocks (Dropdown, Lightbox, Navbar, Slider, Tabs). Defined
 * as real components so React hooks are valid regardless of how Puck invokes a
 * block's `render`. Each wraps `<Box>` for style + `_hidden` support. They render
 * their initial state on SSR and become interactive after hydration.
 *
 * Note: inside the Puck editor canvas, clicks may select the block instead of
 * firing the control — interactions are fully testable on the published page.
 */

type Slot = ComponentType
type StyleBag = Record<string, unknown>
const placeholderCls =
  'flex min-h-40 w-full items-center justify-center rounded border border-dashed text-sm text-muted-foreground'

/** True inside the Puck editor — used to force slots visible so they're fillable. */
function editingFlag(s: StyleBag): boolean {
  return !!(s.puck as { isEditing?: boolean } | undefined)?.isEditing
}

export function DropdownView({
  label,
  content: Content,
  ...s
}: { label?: string; content?: Slot } & StyleBag) {
  const [open, setOpen] = useState(false)
  const editing = editingFlag(s)
  return (
    <Box s={s} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-4 py-2 text-sm"
      >
        {label || 'Menu'}
        <span aria-hidden>▾</span>
      </button>
      <div
        className="min-w-40 rounded-md border border-border bg-background p-1 shadow-md"
        style={{
          display: open || editing ? 'block' : 'none',
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 20,
          marginTop: 4,
        }}
      >
        {Content ? <Content /> : null}
      </div>
    </Box>
  )
}

export function LightboxView({
  thumbnail,
  full,
  alt,
  ...s
}: { thumbnail?: string; full?: string; alt?: string } & StyleBag) {
  const [open, setOpen] = useState(false)
  const fullSrc = full || thumbnail
  return (
    <Box s={s}>
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={alt || ''}
          onClick={() => setOpen(true)}
          className="h-auto max-w-full cursor-zoom-in"
        />
      ) : (
        <div className={placeholderCls}>Add an image</div>
      )}
      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img src={fullSrc} alt={alt || ''} style={{ maxWidth: '90vw', maxHeight: '90vh' }} />
        </div>
      ) : null}
    </Box>
  )
}

export function NavbarView({
  brand,
  content: Content,
  ...s
}: { brand?: string; content?: Slot } & StyleBag) {
  const [open, setOpen] = useState(false)
  const editing = editingFlag(s)
  return (
    <Box as="nav" s={s} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <span className="text-base font-semibold">{brand || 'Brand'}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle menu"
        className="rounded-md border border-input px-2 py-1 text-sm md:hidden"
      >
        ☰
      </button>
      <div
        className={cn(
          'w-full md:flex md:w-auto md:items-center md:gap-6',
          open || editing ? 'block' : 'hidden md:block'
        )}
      >
        {Content ? <Content /> : null}
      </div>
    </Box>
  )
}

export function SliderView({ slides, ...s }: { slides?: unknown } & StyleBag) {
  const items = (Array.isArray(slides) ? slides : []) as Array<{ src?: string; alt?: string }>
  const n = items.length
  const [i, setI] = useState(0)
  if (!n) {
    return (
      <Box s={s}>
        <div className={placeholderCls}>Add slides (image URLs)</div>
      </Box>
    )
  }
  const idx = Math.min(i, n - 1)
  const go = (d: number) => setI((c) => (c + d + n) % n)
  const arrowCls =
    'absolute top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-black/50 text-white'
  return (
    <Box s={s} style={{ position: 'relative' }}>
      <img src={items[idx].src} alt={items[idx].alt || ''} className="h-auto w-full" />
      <button type="button" onClick={() => go(-1)} aria-label="Previous" className={arrowCls} style={{ left: 8 }}>
        ‹
      </button>
      <button type="button" onClick={() => go(1)} aria-label="Next" className={arrowCls} style={{ right: 8 }}>
        ›
      </button>
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
        {items.map((_, d) => (
          <button
            key={d}
            type="button"
            aria-label={`Slide ${d + 1}`}
            onClick={() => setI(d)}
            className={cn('size-2 rounded-full', d === idx ? 'bg-white' : 'bg-white/50')}
          />
        ))}
      </div>
    </Box>
  )
}

export function TabsView({ tabs, ...s }: { tabs?: unknown } & StyleBag) {
  const items = (Array.isArray(tabs) ? tabs : []) as Array<{ label?: string; body?: string }>
  const [active, setActive] = useState(0)
  if (!items.length) {
    return (
      <Box s={s}>
        <div className={placeholderCls}>Add tabs</div>
      </Box>
    )
  }
  const idx = Math.min(active, items.length - 1)
  return (
    <Box s={s}>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {items.map((t, d) => (
          <button
            key={d}
            type="button"
            onClick={() => setActive(d)}
            className={cn(
              'px-4 py-2 text-sm',
              d === idx ? 'border-b-2 border-primary font-medium' : 'text-muted-foreground'
            )}
          >
            {t.label || `Tab ${d + 1}`}
          </button>
        ))}
      </div>
      <div className="p-4 text-sm" style={{ whiteSpace: 'pre-line' }}>
        {items[idx].body || ''}
      </div>
    </Box>
  )
}
