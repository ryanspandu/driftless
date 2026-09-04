import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { Star } from 'lucide-react'
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

/**
 * A Puck slot render-component. The DropZone accepts an optional className/style
 * (so a carousel can lay its slides in a custom track) and `collisionAxis` (for
 * horizontal drag-reorder). All optional, so `<Content />` prop-less still works.
 */
type Slot = ComponentType<{
  className?: string
  style?: CSSProperties
  collisionAxis?: 'dynamic' | 'x' | 'y'
  minEmptyHeight?: number
}>
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Modal semantics: Escape closes, focus moves into the dialog on open and back
  // to the trigger on close. Without this the block was fully keyboard/AT-inert.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <Box s={s}>
      {thumbnail ? (
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setOpen(true)}
          aria-label={alt ? `View image: ${alt}` : 'View image'}
          className="block cursor-zoom-in border-0 bg-transparent p-0"
        >
          <img src={thumbnail} alt={alt || ''} className="h-auto max-w-full" />
        </button>
      ) : (
        <div className={placeholderCls}>Add an image</div>
      )}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || 'Image'}
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
          <button
            type="button"
            ref={closeRef}
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              position: 'fixed',
              top: 16,
              right: 16,
              background: 'transparent',
              border: 0,
              color: '#fff',
              fontSize: 28,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
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
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous"
        className={arrowCls}
        style={{ left: 8 }}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next"
        className={arrowCls}
        style={{ right: 8 }}
      >
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

/**
 * Slot-based carousel. The slides are child blocks laid in a horizontal flex
 * track; the auto-loop (slide-by-slide OR continuous marquee) is driven entirely
 * on the PUBLISHED page by `initCarousels` (see `carousel.ts`), keyed off the
 * `data-carousel*` attrs emitted here. In the editor those attrs are suppressed
 * and the track WRAPS (overflow visible) so every slide stays visible + draggable.
 */
type CarouselProps = {
  content?: Slot
  mode?: string
  interval?: string
  speed?: string
  perView?: string
  gap?: string
  arrows?: string
  dots?: string
  pauseOnHover?: string
} & StyleBag

export function CarouselView({
  content: Content,
  mode,
  interval,
  speed,
  perView,
  gap,
  arrows,
  dots,
  pauseOnHover,
  ...s
}: CarouselProps) {
  const editing = editingFlag(s)
  const per = Math.max(1, Number(perView) || 1)
  const g = typeof gap === 'string' && gap.trim() ? gap.trim() : '16px'

  if (!Content) {
    return (
      <Box s={s}>
        <div className={placeholderCls}>Add slides — drag blocks in</div>
      </Box>
    )
  }

  const runtimeAttrs: Record<string, string> = editing
    ? {}
    : {
        'data-carousel': mode === 'marquee' ? 'marquee' : 'slide',
        'data-ca-interval': String(Number(interval) || 4),
        'data-ca-speed': String(Number(speed) || 20),
        'data-ca-arrows': arrows === 'false' ? 'false' : 'true',
        'data-ca-dots': dots === 'false' ? 'false' : 'true',
        'data-ca-pause': pauseOnHover === 'false' ? 'false' : 'true',
      }

  return (
    <Box
      s={s}
      className="ca-viewport"
      style={{ position: 'relative', overflow: editing ? 'visible' : 'hidden' }}
      {...runtimeAttrs}
    >
      <Content
        className="carousel-track"
        style={
          {
            'display': 'flex',
            'flexWrap': editing ? 'wrap' : 'nowrap',
            'gap': 'var(--ca-gap)',
            '--ca-per': String(per),
            '--ca-gap': g,
          } as CSSProperties
        }
        collisionAxis={editing ? 'dynamic' : 'x'}
        minEmptyHeight={160}
      />
    </Box>
  )
}

/** Row of 5 stars, `value` filled. */
function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            'size-4',
            n <= value
              ? 'fill-amber-400 text-amber-400'
              : 'fill-transparent text-muted-foreground/40'
          )}
        />
      ))}
    </div>
  )
}

/** Manual/curated reviews — a responsive grid of rating cards (no API needed). */
type Review = { author?: string; rating?: string; text?: string; date?: string; avatar?: string }

export function ReviewsView({
  reviews,
  columns,
  heading,
  showAggregate,
  ...s
}: {
  reviews?: unknown
  columns?: string
  heading?: string
  showAggregate?: string
} & StyleBag) {
  const items = (Array.isArray(reviews) ? reviews : []) as Review[]
  if (!items.length) {
    return (
      <Box s={s}>
        <div className={placeholderCls}>Add reviews</div>
      </Box>
    )
  }
  const cols = Math.max(1, Math.min(4, Number(columns) || 3))
  const ratingOf = (r: Review) => Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)))
  const avg = items.reduce((sum, r) => sum + ratingOf(r), 0) / items.length

  return (
    <Box s={s}>
      {heading || showAggregate === 'true' ? (
        <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
          {heading ? <h3 className="text-xl font-semibold">{heading}</h3> : null}
          {showAggregate === 'true' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Stars value={Math.round(avg)} />
              <span>
                {avg.toFixed(1)} · {items.length} review{items.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="reviews-grid" style={{ '--rv-cols': String(cols) } as CSSProperties}>
        {items.map((r, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <Stars value={ratingOf(r)} />
            <p className="text-sm leading-relaxed">{r.text || ''}</p>
            <div className="mt-auto flex items-center gap-3 pt-1">
              {r.avatar ? (
                <img src={r.avatar} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                  {(r.author || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.author || 'Anonymous'}</div>
                {r.date ? <div className="text-xs text-muted-foreground">{r.date}</div> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Box>
  )
}
