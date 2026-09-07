import { useEffect, useId, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import {
  Award,
  BadgeCheck,
  Blocks,
  Boxes,
  ChevronDown,
  CircleCheck,
  Clock,
  Feather,
  Gift,
  Globe,
  Hammer,
  Heart,
  House,
  CirclePlay,
  Layers,
  Leaf,
  Lock,
  Package,
  Palette,
  Play,
  Recycle,
  RotateCcw,
  Ruler,
  Shield,
  ShieldCheck,
  Sofa,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  Truck,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import { Box } from './style-fields'
import { useBlockData } from '~/puck/block-data'
import type { ResolvedMenuDto, ResolvedMenuItemDto } from '~/types/api'

/**
 * Curated icon set for the `Icon` block — enough to dress a trust bar, a feature
 * row or a stat without shipping all of lucide. Keyed by a stable kebab name the
 * MCP catalog can enumerate; unknown names fall back to a star.
 */
const ICONS: Record<string, ComponentType<{ size?: number | string; strokeWidth?: number }>> = {
  'palette': Palette,
  'blocks': Blocks,
  'layers': Layers,
  'boxes': Boxes,
  'truck': Truck,
  'package': Package,
  'shield-check': ShieldCheck,
  'shield': Shield,
  'badge-check': BadgeCheck,
  'check': CircleCheck,
  'star': Star,
  'heart': Heart,
  'thumbs-up': ThumbsUp,
  'award': Award,
  'leaf': Leaf,
  'recycle': Recycle,
  'ruler': Ruler,
  'wrench': Wrench,
  'hammer': Hammer,
  'sofa': Sofa,
  'home': House,
  'clock': Clock,
  'lock': Lock,
  'sparkles': Sparkles,
  'zap': Zap,
  'gift': Gift,
  'rotate-ccw': RotateCcw,
  'globe': Globe,
  'feather': Feather,
  'wind': Wind,
  'tag': Tag,
  'play': Play,
  'circle-play': CirclePlay,
}

/** The icon keys the catalog advertises, so an AI knows the valid `name` values. */
export const ICON_NAMES = Object.keys(ICONS)

/**
 * A single icon. In fidelity order: an uploaded/cropped icon image via `src`
 * (renders as an <img>, so a design's OWN icon can be used); else a curated
 * lucide key `name` (a monochrome line-icon coloured by the surrounding
 * `textColor`); else an emoji, which renders as a full-colour glyph. `size` is a
 * px string. SSR-safe, no hooks.
 */
export function IconView({
  name,
  size,
  src,
  ...s
}: { name?: string; size?: string; src?: string } & StyleBag) {
  const key = (name || '').trim()
  const px = typeof size === 'string' && size.trim() ? Number.parseInt(size, 10) || 28 : 28
  const url = typeof src === 'string' ? src.trim() : ''
  if (url) {
    return (
      <Box s={s}>
        <img
          src={url}
          width={px}
          height={px}
          alt=""
          style={{ display: 'block', objectFit: 'contain' }}
        />
      </Box>
    )
  }
  if (/\p{Extended_Pictographic}/u.test(key)) {
    return (
      <Box s={s}>
        <span style={{ fontSize: px, lineHeight: 1 }} aria-hidden>
          {key}
        </span>
      </Box>
    )
  }
  const Cmp = ICONS[key] ?? Star
  return (
    <Box s={s}>
      <Cmp size={px} strokeWidth={1.75} />
    </Box>
  )
}

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
  layout,
  ...s
}: {
  reviews?: unknown
  columns?: string
  heading?: string
  showAggregate?: string
  layout?: string
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
  // 'carousel' lays the same cards in a horizontal scroll-snap track (a slider);
  // 'grid' (default) is the static responsive grid.
  const trackClass = layout === 'carousel' ? 'reviews-carousel' : 'reviews-grid'
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
      <div className={trackClass} style={{ '--rv-cols': String(cols) } as CSSProperties}>
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

/**
 * FAQ-style accordion. Built on native `<details>`/`<summary>` so it expands and
 * collapses without any JavaScript — it works identically on the published page,
 * during SSR, and inside the editor canvas (where scripted interactivity is
 * suppressed). The chevron rotates via the CSS `open:` state, no hydration
 * needed.
 */
type FaqItem = { question?: string; answer?: string }

export function AccordionView({
  items,
  heading,
  ...s
}: { items?: unknown; heading?: string } & StyleBag) {
  const list = (Array.isArray(items) ? items : []) as FaqItem[]
  if (!list.length) {
    return (
      <Box s={s}>
        <div className={placeholderCls}>Add FAQ items</div>
      </Box>
    )
  }
  return (
    <Box s={s}>
      {heading ? <h2 className="mb-4 text-2xl font-semibold">{heading}</h2> : null}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {list.map((it, i) => (
          <details
            key={i}
            className="pk-accordion group px-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium">
              <span>{it.question || `Question ${i + 1}`}</span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div
              className="pb-4 text-sm leading-relaxed text-muted-foreground"
              style={{ whiteSpace: 'pre-line' }}
            >
              {it.answer || ''}
            </div>
          </details>
        ))}
      </div>
    </Box>
  )
}

/** Must match the server's `menuDataKey` in core_block_resolvers.ts. */
function menuDataKey(handle: string): string {
  return `menu:${handle}`
}

async function fetchMenu(handle: string): Promise<ResolvedMenuDto> {
  const res = await fetch(`/api/public/menus/${encodeURIComponent(handle)}`)
  if (!res.ok) throw new Error('menu fetch failed')
  return res.json()
}

/** A dropdown/mega panel built from a menu item's children. */
function MenuPanelContent({ items }: { items: ResolvedMenuItemDto[] }) {
  const isMega = items.some((c) => c.children.length > 0)
  if (!isMega) {
    return (
      <ul className="min-w-48 list-none">
        {items.map((c) => (
          <li key={c.id}>
            <a
              href={c.href}
              target={c.target}
              rel={c.target === '_blank' ? 'noopener noreferrer' : undefined}
              className="block rounded px-2.5 py-1.5 text-sm hover:bg-muted"
            >
              {c.label}
            </a>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div
      className="grid gap-5 p-1.5"
      style={{
        gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(10rem, 1fr))`,
      }}
    >
      {items.map((col) => (
        <div key={col.id}>
          <a href={col.href} target={col.target} className="mb-2 block text-sm font-semibold">
            {col.label}
          </a>
          {col.children.length > 0 && (
            <ul className="list-none space-y-1">
              {col.children.map((l) => (
                <li key={l.id}>
                  <a
                    href={l.href}
                    target={l.target}
                    rel={l.target === '_blank' ? 'noopener noreferrer' : undefined}
                    className="block py-0.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

/** One top-level bar entry: a plain link, or a trigger that opens a popup. */
function MenuBarItem({ item }: { item: ResolvedMenuItemDto }) {
  // A popup appears automatically for any item that has sub-items. Its layout is
  // derived from the structure: a full-width MEGA panel when the sub-items
  // themselves have children (columns), otherwise a simple anchored dropdown.
  const hasPanel = item.children.length > 0
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLLIElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const clearTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  useEffect(() => clearTimer, [])

  if (!hasPanel) {
    return (
      <li>
        <a
          href={item.href}
          target={item.target}
          rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
          className="block rounded-md px-3 py-2 text-sm"
        >
          {item.label}
        </a>
      </li>
    )
  }

  const full = item.children.some((c) => c.children.length > 0)
  return (
    <li
      ref={rootRef}
      className="md:relative"
      onPointerEnter={(e) => {
        if (e.pointerType === 'touch') return
        clearTimer()
        setOpen(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return
        clearTimer()
        closeTimer.current = setTimeout(() => setOpen(false), 150)
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={panelId}
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm"
      >
        {item.label}
        <ChevronDown
          className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={item.label}
        className={cn(
          'w-full rounded-md border border-border bg-background p-1.5 shadow-lg md:absolute md:top-full md:mt-1 md:w-auto',
          full ? 'md:left-0' : 'md:left-0 md:min-w-52'
        )}
        style={{ display: open ? 'block' : 'none', zIndex: 20 }}
      >
        <MenuPanelContent items={item.children} />
      </div>
    </li>
  )
}

/**
 * A navigation bar rendered from a reusable menu (the Menu Manager), bound by
 * `menuHandle`. The menu tree is resolved server-side through the block-data
 * pipeline, so the nav is in the initial HTML; on a CSR/preview page it falls
 * back to fetching `/api/public/menus/:handle`. Items with children open a
 * dropdown/mega panel.
 */
export function MenuBarView({
  menuHandle,
  brand,
  ...s
}: { menuHandle?: string; brand?: string } & StyleBag) {
  const handle = (menuHandle || '').trim()
  const editing = editingFlag(s)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data } = useBlockData<ResolvedMenuDto | null>(handle ? menuDataKey(handle) : null, () =>
    fetchMenu(handle)
  )

  if (!handle) {
    return (
      <Box as="nav" s={s} className="px-4 py-3">
        <div className={placeholderCls}>
          Set this MenuBar’s “Menu handle” to a menu you created.
        </div>
      </Box>
    )
  }

  const items = data?.items ?? []
  return (
    <Box as="nav" s={s} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      {brand ? <span className="text-base font-semibold">{brand}</span> : <span />}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle menu"
        className="rounded-md border border-input px-2 py-1 text-sm md:hidden"
      >
        ☰
      </button>
      <ul
        className={cn(
          'w-full list-none md:flex md:w-auto md:items-center md:gap-1',
          mobileOpen || editing ? 'block' : 'hidden md:flex'
        )}
      >
        {items.map((it) => (
          <MenuBarItem key={it.id} item={it} />
        ))}
      </ul>
    </Box>
  )
}
