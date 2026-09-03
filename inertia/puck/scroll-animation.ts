import type { CSSProperties } from 'react'

/**
 * Scroll-into-view reveal animations for builder blocks ("animate on scroll",
 * the Webflow flagship interaction).
 *
 * Design constraints that shape this file:
 *
 * - **SSR / no-JS must stay visible.** The published markup (including the SSR
 *   components `public/page_ssr` and SSG HTML snapshots) is rendered with the
 *   element in its *final, visible* state. The hidden start state lives ONLY in
 *   CSS gated on the `.sa-active` class (see `inertia/css/app.css`), and that
 *   class is added by `initScrollAnimations` after the client mounts. So with
 *   JS off, or before hydration, nothing is ever hidden — good for SEO too.
 * - **Zero dependency.** A single shared `IntersectionObserver` per distinct
 *   threshold; no `aos`/`framer-motion`. Keeps the serwist-precached public
 *   bundle tiny.
 * - **Reduced motion.** Double-guarded: the runtime bails before adding
 *   `.sa-active`, and the CSS has a `prefers-reduced-motion` override.
 *
 * This module is pure/side-effect-free at import time (only function defs), so
 * it is safe to import from the SSR render path; the DOM work happens inside
 * `initScrollAnimations`, which callers run from a client-only effect.
 */

/** The reveal presets, reused by the editor's Interactions control. */
export const SCROLL_ANIMATION_PRESETS = [
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'zoom-in',
  'zoom-out',
  'flip',
] as const

export type ScrollAnimationPreset = (typeof SCROLL_ANIMATION_PRESETS)[number]

/** When the entrance animation fires. Absent = 'scroll' (back-compat). */
export type ScrollAnimationTrigger = 'scroll' | 'load'
/** Where in the viewport a scroll-triggered element reveals. Absent = 'bottom'. */
export type ScrollAnimationPosition = 'top' | 'center' | 'bottom'

export interface ScrollAnimation {
  type?: '' | ScrollAnimationPreset
  duration?: string
  delay?: string
  easing?: string
  distance?: string
  threshold?: string
  once?: boolean
  /** 'scroll' (into view, default) or 'load' (as the page loads). */
  trigger?: ScrollAnimationTrigger
  /** Scroll only: viewport line the element must reach to reveal. */
  position?: ScrollAnimationPosition
}

function isPreset(value: unknown): value is ScrollAnimationPreset {
  return (
    typeof value === 'string' && (SCROLL_ANIMATION_PRESETS as readonly string[]).includes(value)
  )
}

/** The result the render primitive (`Box`) spreads onto the DOM element. */
export interface ScrollAnimationEmit {
  attrs: Record<string, string>
  vars: CSSProperties
}

const EMPTY: ScrollAnimationEmit = { attrs: {}, vars: {} }

/**
 * Given a block's loose prop bag, produce the DOM attributes + CSS custom
 * properties that arm a scroll reveal. Returns nothing when there is no
 * animation configured, or while editing (animations must not fire in the
 * builder canvas — the runtime is also never loaded there).
 *
 * IMPORTANT: this never returns `opacity`/`transform` — only inert custom
 * properties and data-attributes. The visible hidden state is applied purely in
 * CSS under `.sa-active`, so first paint / SSR / no-JS stay visible.
 */
export function scrollAnimationAttrs(
  bag: Record<string, unknown>,
  isEditing: boolean
): ScrollAnimationEmit {
  if (isEditing) return EMPTY
  const sa = bag.scrollAnimation
  if (!sa || typeof sa !== 'object') return EMPTY

  const a = sa as ScrollAnimation
  if (!isPreset(a.type)) return EMPTY

  const attrs: Record<string, string> = {
    'data-scroll-animation': a.type,
    // Default is play-once (Webflow's default); only 'false' opts into replay.
    'data-sa-once': a.once === false ? 'false' : 'true',
  }
  if (typeof a.threshold === 'string' && a.threshold.trim()) {
    attrs['data-sa-threshold'] = a.threshold.trim()
  }
  // Default trigger ('scroll') is omitted; only 'load' opts out of the observer.
  if (a.trigger === 'load') attrs['data-sa-trigger'] = 'load'
  if (a.position === 'top' || a.position === 'center' || a.position === 'bottom') {
    attrs['data-sa-position'] = a.position
  }

  // Inert custom properties consumed by the CSS transition/transform. Only
  // emitted when set; the CSS provides sensible fallbacks via `var(--sa-*, …)`.
  const vars: Record<string, string> = {}
  if (typeof a.duration === 'string' && a.duration.trim()) vars['--sa-duration'] = a.duration.trim()
  if (typeof a.delay === 'string' && a.delay.trim()) vars['--sa-delay'] = a.delay.trim()
  if (typeof a.easing === 'string' && a.easing.trim()) vars['--sa-easing'] = a.easing.trim()
  if (typeof a.distance === 'string' && a.distance.trim()) vars['--sa-distance'] = a.distance.trim()

  return { attrs, vars: vars as CSSProperties }
}

/** Parse a stored threshold ("15" or "0.15") into a clamped 0..1 fraction. */
function thresholdFraction(raw: string | undefined): number {
  const n = raw ? Number.parseFloat(raw) : Number.NaN
  if (!Number.isFinite(n)) return 0.15
  const frac = n > 1 ? n / 100 : n
  return Math.min(1, Math.max(0, frac))
}

/**
 * Viewport line the element must cross to reveal, as an IntersectionObserver
 * `rootMargin` shrinking the root's bottom edge: `bottom` triggers as it enters
 * from the bottom (early, the historical default), `center` at mid-viewport,
 * `top` only once it nears the top (late).
 */
const POSITION_ROOT_MARGIN: Record<string, string> = {
  top: '0px 0px -85% 0px',
  center: '0px 0px -50% 0px',
  bottom: '0px 0px -8% 0px',
}

function positionRootMargin(pos: string | undefined): string {
  return POSITION_ROOT_MARGIN[pos ?? ''] ?? POSITION_ROOT_MARGIN.bottom!
}

/**
 * Wire up scroll reveals inside `root` (the public page's `.theme-light` div).
 * Returns a cleanup function. No-op (and leaves everything visible) when reduced
 * motion is requested or `IntersectionObserver` is unavailable.
 */
export function initScrollAnimations(root: HTMLElement): () => void {
  if (typeof window === 'undefined') return () => {}
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}

  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-animation]'))
  if (els.length === 0) return () => {}

  // Arming the hidden state: only now does the CSS `.sa-active [data-scroll-animation]`
  // rule apply opacity:0. Before this, and without JS, the elements are visible.
  root.classList.add('sa-active')

  // On-load reveals: no observer — reveal once the hidden state has painted, so
  // the transition plays instead of snapping. Double rAF ensures that first paint.
  const loadEls = els.filter((el) => el.dataset.saTrigger === 'load')
  let raf1 = 0
  let raf2 = 0
  if (loadEls.length) {
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        for (const el of loadEls) el.classList.add('sa-in')
      })
    })
  }

  // On-scroll reveals via IntersectionObserver.
  const scrollEls = els.filter((el) => el.dataset.saTrigger !== 'load')
  const observers: IntersectionObserver[] = []
  if (scrollEls.length) {
    if (!('IntersectionObserver' in window)) {
      // No observer support: reveal now rather than leave them stuck hidden.
      for (const el of scrollEls) el.classList.add('sa-in')
    } else {
      const reveal: IntersectionObserverCallback = (entries, observer) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) {
            el.classList.add('sa-in')
            if (el.dataset.saOnce !== 'false') observer.unobserve(el)
          } else if (el.dataset.saOnce === 'false') {
            // Replay mode: re-hide when it leaves so it animates again next time.
            el.classList.remove('sa-in')
          }
        }
      }

      // One observer per distinct (threshold, viewport position) pair.
      const groups = new Map<
        string,
        { threshold: number; rootMargin: string; els: HTMLElement[] }
      >()
      for (const el of scrollEls) {
        const threshold = thresholdFraction(el.dataset.saThreshold)
        const rootMargin = positionRootMargin(el.dataset.saPosition)
        const key = `${threshold}|${rootMargin}`
        const g = groups.get(key) ?? { threshold, rootMargin, els: [] }
        g.els.push(el)
        groups.set(key, g)
      }
      for (const { threshold, rootMargin, els: groupEls } of groups.values()) {
        const observer = new IntersectionObserver(reveal, { threshold, rootMargin })
        for (const el of groupEls) observer.observe(el)
        observers.push(observer)
      }
    }
  }

  return () => {
    if (raf1) cancelAnimationFrame(raf1)
    if (raf2) cancelAnimationFrame(raf2)
    for (const observer of observers) observer.disconnect()
    root.classList.remove('sa-active')
    for (const el of els) el.classList.remove('sa-in')
  }
}
