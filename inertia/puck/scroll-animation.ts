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

export interface ScrollAnimation {
  type?: '' | ScrollAnimationPreset
  duration?: string
  delay?: string
  easing?: string
  distance?: string
  threshold?: string
  once?: boolean
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
 * Wire up scroll reveals inside `root` (the public page's `.theme-light` div).
 * Returns a cleanup function. No-op (and leaves everything visible) when reduced
 * motion is requested or `IntersectionObserver` is unavailable.
 */
export function initScrollAnimations(root: HTMLElement): () => void {
  if (typeof window === 'undefined') return () => {}
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  if (!('IntersectionObserver' in window)) return () => {}

  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-animation]'))
  if (els.length === 0) return () => {}

  // Arming the hidden state: only now does the CSS `.sa-active [data-scroll-animation]`
  // rule apply opacity:0. Before this, and without JS, the elements are visible.
  root.classList.add('sa-active')

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

  // One observer per distinct threshold (usually just one for the whole page).
  const groups = new Map<number, HTMLElement[]>()
  for (const el of els) {
    const t = thresholdFraction(el.dataset.saThreshold)
    const arr = groups.get(t) ?? []
    arr.push(el)
    groups.set(t, arr)
  }

  const observers: IntersectionObserver[] = []
  for (const [threshold, groupEls] of groups) {
    const observer = new IntersectionObserver(reveal, {
      threshold,
      rootMargin: '0px 0px -8% 0px',
    })
    for (const el of groupEls) observer.observe(el)
    observers.push(observer)
  }

  return () => {
    for (const observer of observers) observer.disconnect()
    root.classList.remove('sa-active')
    for (const el of els) el.classList.remove('sa-in')
  }
}
