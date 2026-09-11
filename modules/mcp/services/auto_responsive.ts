/**
 * Generate mobile/tablet responsive overrides for a Puck document.
 *
 * MCP-built pages are authored desktop-first; without per-breakpoint overrides a
 * 4-up grid stays 4-up on a phone and a 60/40 split never stacks. This walks the
 * tree and fills sensible `props.responsive` overrides so a page is usable on
 * mobile out of the box. It is ADDITIVE and per-key: an override the author
 * already set is never touched, so hand-tuned responsive wins. The renderer's
 * layout blocks read these overrides (see `mergeLayout` in style-fields.tsx).
 *
 * Breakpoint ids match the defaults (`tablet` ≤768px, `mobile` ≤390px). A site
 * with custom breakpoints still benefits — unknown tiers are simply ignored by
 * the renderer.
 */

const MOBILE = 'mobile'
const TABLET = 'tablet'

interface Node {
  type?: unknown
  props?: Record<string, unknown>
  [k: string]: unknown
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
/** Parse a bare `"48px"` value; null for anything else (shorthands, %, calc). */
function px(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(-?\d+(?:\.\d+)?)px$/)
  return m ? Number(m[1]) : null
}

function ensureBp(props: Record<string, unknown>, bp: string): Record<string, unknown> {
  if (!props.responsive || typeof props.responsive !== 'object') props.responsive = {}
  const r = props.responsive as Record<string, unknown>
  if (!r[bp] || typeof r[bp] !== 'object') r[bp] = {}
  return r[bp] as Record<string, unknown>
}
interface Report {
  touched: number
  /** One entry per override actually added — { block id, breakpoint, field }. */
  changes: Array<{ id: string; bp: string; field: string }>
}

/** Set an override key only if the author hasn't already set it (additive). */
function fill(
  props: Record<string, unknown>,
  bp: string,
  key: string,
  value: string,
  report?: Report,
  id?: string
): boolean {
  const layer = ensureBp(props, bp)
  if (layer[key] !== undefined) return false
  layer[key] = value
  if (report && id) report.changes.push({ id, bp, field: key })
  return true
}

function autoNode(node: Node, report: Report): void {
  if (!node || typeof node !== 'object') return
  const type = node.type
  const props = (node.props ??= {}) as Record<string, unknown>
  const id = typeof props.id === 'string' ? props.id : typeof type === 'string' ? type : 'block'
  let touched = false

  // Grid / QuickStack / Columns — fewer columns on smaller tiers.
  if (type === 'Grid' || type === 'QuickStack' || type === 'Columns') {
    const field = type === 'Columns' ? 'count' : 'columns'
    const cols = num(props[field])
    if (cols && cols >= 2) {
      const tablet = Math.min(cols, 2)
      const mobile = cols >= 4 ? 2 : 1
      if (tablet < cols) touched = fill(props, TABLET, field, String(tablet), report, id) || touched
      if (mobile < cols) touched = fill(props, MOBILE, field, String(mobile), report, id) || touched
    }
  }

  // HFlex — stack an ASYMMETRIC split (a child carries a % width) on mobile and
  // make those children full-width. Inline groups (buttons, swatches, price
  // rows — no %-width child) stay a wrapping row, which is already fine.
  if (type === 'HFlex') {
    const kids = Array.isArray(props.content) ? (props.content as Node[]) : []
    const splitKids = kids.filter(
      (k) => k && typeof k === 'object' && typeof k.props?.width === 'string' && (k.props.width as string).includes('%')
    )
    if (splitKids.length) {
      touched = fill(props, MOBILE, 'flexDirection', 'column', report, id) || touched
      touched = fill(props, MOBILE, 'alignItems', 'stretch', report, id) || touched
      for (const k of splitKids) {
        const kp = (k.props ??= {}) as Record<string, unknown>
        const kid = typeof kp.id === 'string' ? kp.id : id
        fill(kp, MOBILE, 'width', '100%', report, kid)
      }
    }
  }

  // Heading — scale big type down so it doesn't overflow a phone.
  if (type === 'Heading') {
    const size = px(props.textSize)
    if (size && size >= 34) {
      touched = fill(props, MOBILE, 'textSize', `${Math.round(size * 0.6)}px`, report, id) || touched
      touched = fill(props, TABLET, 'textSize', `${Math.round(size * 0.8)}px`, report, id) || touched
    }
  }

  // Section — trim a tall hero on mobile.
  if (type === 'Section') {
    const mh = px(props.minHeight)
    if (mh && mh >= 480)
      touched = fill(props, MOBILE, 'minHeight', `${Math.round(mh * 0.7)}px`, report, id) || touched
  }

  if (touched) report.touched++

  // Recurse into every slot (array-valued prop).
  for (const v of Object.values(props)) {
    if (Array.isArray(v)) for (const c of v) autoNode(c as Node, report)
  }
}

export interface AutoResponsiveResult {
  doc: unknown
  /** How many blocks received at least one new override. */
  touched: number
  /** Each override added — { block id, breakpoint, field } — so the caller can see exactly what changed. */
  changes: Array<{ id: string; bp: string; field: string }>
}

/**
 * Mutate `doc` in place, filling responsive overrides. Returns the doc + a count
 * + the per-override list. Safe to call on any value; a non-object doc is
 * returned untouched.
 */
export function generateResponsive(doc: unknown): AutoResponsiveResult {
  const report: Report = { touched: 0, changes: [] }
  if (doc && typeof doc === 'object') {
    const d = doc as { content?: unknown }
    if (Array.isArray(d.content)) for (const n of d.content) autoNode(n as Node, report)
  }
  return { doc, touched: report.touched, changes: report.changes }
}
