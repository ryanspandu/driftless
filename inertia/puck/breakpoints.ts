import { createContext } from 'react'

/**
 * Webflow-style responsive breakpoints for the builder.
 *
 * A breakpoint is a named viewport width. The WIDEST tier (`maxWidth: null`) is
 * the BASE — its styles are the element's ordinary flat props (`padding`, `bg`,
 * …), so every page built before this feature is unchanged with zero migration.
 * Narrower tiers store only their OVERRIDES under `props.responsive[bpId]`, and
 * cascade desktop-first: each smaller tier inherits the larger ones and overrides
 * on top (published as `@media (max-width: N)` rules, widest → narrowest).
 *
 * The tier LIST is global/site-wide (persisted in web_settings), so every page
 * and template shares one design system; only the per-element overrides live in
 * the page content. This module is pure + SSR-safe (used by the render path).
 */

export type Breakpoint = {
  id: string
  label: string
  /** `null` = the base / widest tier (Desktop); a number = its max-width in px. */
  maxWidth: number | null
  /** A user-added custom resolution, vs the built-in desktop/tablet/mobile. */
  custom?: boolean
}

/** Default base tier id — its styles are the element's flat (non-responsive) props. */
export const BASE_BREAKPOINT_ID = 'desktop'

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: 'desktop', label: 'Desktop', maxWidth: null },
  { id: 'tablet', label: 'Tablet', maxWidth: 768 },
  { id: 'mobile', label: 'Mobile', maxWidth: 390 },
]

const MIN_WIDTH = 200
const MAX_WIDTH = 3840
const MAX_BREAKPOINTS = 12

/** The base tier of a list (the widest, `maxWidth: null`) — the flat-props layer. */
export function baseBreakpoint(bps: Breakpoint[]): Breakpoint | undefined {
  return bps.find((b) => b.maxWidth === null)
}

/** Base tier first, then by DESCENDING max-width (widest → narrowest). */
export function orderBreakpoints(bps: Breakpoint[]): Breakpoint[] {
  return [...bps].sort((a, b) => {
    if (a.maxWidth === null) return -1
    if (b.maxWidth === null) return 1
    return b.maxWidth - a.maxWidth
  })
}

/**
 * Parse + sanitize a stored breakpoint list into a valid, ordered set. Accepts a
 * JSON string or an array; always returns at least the base tier. Widths are
 * clamped, ids validated, duplicates and overflow dropped — this list becomes a
 * generated stylesheet, so it must be trustworthy.
 */
export function readBreakpoints(raw: unknown): Breakpoint[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return DEFAULT_BREAKPOINTS
    try {
      list = JSON.parse(raw)
    } catch {
      return DEFAULT_BREAKPOINTS
    }
  }
  if (!Array.isArray(list)) return DEFAULT_BREAKPOINTS

  const seen = new Set<string>()
  const out: Breakpoint[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || seen.has(id)) continue

    let maxWidth: number | null
    if (o.maxWidth === null) {
      maxWidth = null
    } else {
      const n = Number(o.maxWidth)
      if (!Number.isFinite(n)) continue
      maxWidth = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n)))
    }

    const label =
      typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 40) : id
    seen.add(id)
    out.push({ id, label, maxWidth, custom: o.custom === true })
    if (out.length >= MAX_BREAKPOINTS) break
  }

  // Guarantee exactly one base tier so the cascade always has a root.
  if (!out.some((b) => b.maxWidth === null)) {
    out.unshift({ id: BASE_BREAKPOINT_ID, label: 'Desktop', maxWidth: null })
  }
  return orderBreakpoints(out)
}

/**
 * The tier a given canvas width falls into, desktop-first: the NARROWEST tier
 * whose `max-width` still covers `width` (so 500px → Tablet, since ≤768 matches
 * but ≤390 doesn't), or the base tier when nothing narrower applies / width is
 * null (full). Used to keep "which breakpoint am I editing" in sync with the
 * previewed width.
 */
export function breakpointForWidth(breakpoints: Breakpoint[], width: number | null): string {
  const base = baseBreakpoint(breakpoints)
  if (width == null) return base?.id ?? BASE_BREAKPOINT_ID
  let match: Breakpoint | null = null
  for (const bp of breakpoints) {
    if (bp.maxWidth != null && bp.maxWidth >= width) {
      if (!match || bp.maxWidth < (match.maxWidth ?? Infinity)) match = bp
    }
  }
  return match?.id ?? base?.id ?? BASE_BREAKPOINT_ID
}

/** The per-breakpoint style overrides on a block (`props.responsive[bpId] = {…}`). */
export function readResponsive(
  props: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const r = props.responsive
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [bp, ov] of Object.entries(r as Record<string, unknown>)) {
    if (ov && typeof ov === 'object' && !Array.isArray(ov)) {
      out[bp] = ov as Record<string, unknown>
    }
  }
  return out
}

/**
 * Desktop-first cascade — the EFFECTIVE style bag at `activeBpId`: the base flat
 * props overlaid with every tier from widest down to (and including) the active
 * one. The base tier (or an unknown id) returns the props unchanged. Used by the
 * editor to flatten the previewed breakpoint to inline styles (the fixed-width
 * canvas can't honour real `@media`).
 */
export function cascadeStyleBag(
  props: Record<string, unknown>,
  breakpoints: Breakpoint[],
  activeBpId: string | null
): Record<string, unknown> {
  const base = baseBreakpoint(breakpoints)
  if (!activeBpId || activeBpId === base?.id) return props
  const responsive = readResponsive(props)
  if (Object.keys(responsive).length === 0) return props

  let merged = props
  for (const bp of orderBreakpoints(breakpoints)) {
    if (bp.maxWidth !== null && responsive[bp.id]) merged = { ...merged, ...responsive[bp.id] }
    if (bp.id === activeBpId) break
  }
  return merged
}

/**
 * Editor breakpoint state, shared from the builder shell down to every `Box` in
 * the canvas (and provided by the public renderer too). `activeBp === null` means
 * "published mode": emit real `@media` CSS rather than flattening a preview.
 */
export type BreakpointState = { breakpoints: Breakpoint[]; activeBp: string | null }

export const BreakpointContext = createContext<BreakpointState>({
  breakpoints: DEFAULT_BREAKPOINTS,
  activeBp: null,
})
