/**
 * Design-layout extraction — turn a design frame (Lunacy FREE-format JSON) into
 * deterministic per-element LAYOUT FACTS and a fill-ready Puck scaffold.
 *
 * WHY: the MCP page builder authors BLIND. The model reads a scaled screenshot of
 * a design and transcribes numbers by hand, so the layout details that read as
 * "off" — a heading centred instead of left, a header row `flex-end` instead of
 * `flex-start`, a testimonials title left instead of centred, a "+" hotspot that
 * never got emitted — drift silently. None of those are builder limits (every one
 * is expressible with existing styleProps); they are guesses. This service removes
 * the guessing by deriving alignment / justification / text-align / overlays from
 * the frame's real geometry (`pos`/`size`, which are always present), and emits a
 * scaffold that already carries the correct styleProps for the model to fill.
 *
 * Input is Lunacy's FREE format, but everything downstream of `normalizeFreeFrame`
 * works on the tool-agnostic `LayoutNode`, so a Figma adapter can be added later
 * as a second front-end that produces the same shape.
 *
 * Heuristic, by design: geometry-based inference is right the vast majority of the
 * time but not always, so the tool returns the raw facts alongside the scaffold —
 * the model can override any field. Typography (exact font size/weight) is NOT
 * reliably recoverable from FREE and is left for the model to fill, same as the
 * section presets leave empty image slots.
 */

// ── FREE input (only the fields we read; the rest is ignored) ────────────────
export interface FreeNode {
  _t?: string
  id?: string
  name?: string | null
  pos?: [number, number] | null
  size?: [number, number] | null
  text?: string
  textAlign?: number | string | null
  fills?: unknown[]
  fill?: unknown
  layers?: FreeNode[]
  style?: Record<string, unknown>
  textStyle?: Record<string, unknown>
  [k: string]: unknown
}

// ── Normalized, tool-agnostic layout facts ───────────────────────────────────
export type LayoutRole =
  | 'container'
  | 'heading'
  | 'paragraph'
  | 'label'
  | 'button'
  | 'image'
  | 'icon'
  | 'badge'
  | 'unknown'

export type Align = 'flex-start' | 'center' | 'flex-end' | 'stretch'
export type TextAlign = 'left' | 'center' | 'right'

export interface LayoutNode {
  /** Stable id carried onto the emitted Puck block, so the layout lint can match built→design by id. */
  blockId: string
  srcId?: string
  name?: string
  role: LayoutRole
  /** Absolute box in FRAME coordinates. */
  bbox: { x: number; y: number; w: number; h: number }
  /** Paint order among siblings (later = on top). */
  order: number
  text?: string
  textAlign?: TextAlign
  // Container-only inferences:
  flexDirection?: 'row' | 'column'
  alignItems?: Align
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between'
  gap?: number
  // Image-only:
  imageRef?: string
  // Overlay (a badge/icon/marker sitting on top of an image sibling):
  isInstance?: boolean
  instanceName?: string
  overlayOf?: string
  leftPct?: number
  topPct?: number
  children: LayoutNode[]
}

export interface LayoutFacts {
  viewportW: number
  frameId?: string
  frameName?: string
  /** Short per-run token that prefixes every blockId so ids stay unique across calls. */
  idPrefix: string
  nodes: LayoutNode[]
  warnings: string[]
}

// ── helpers ──────────────────────────────────────────────────────────────────

const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'BOOL', 'ARTBOARD'])
const IMAGE_TYPES = new Set(['RECT', 'IMAGE', 'BITMAP'])

function pos(n: FreeNode): [number, number] {
  const p = n.pos
  return [Array.isArray(p) ? p[0] || 0 : 0, Array.isArray(p) ? p[1] || 0 : 0]
}
function size(n: FreeNode): [number, number] {
  const s = n.size
  return [Array.isArray(s) ? s[0] || 0 : 0, Array.isArray(s) ? s[1] || 0 : 0]
}

/** True when a fill/pattern references a raster image (→ the node is a photo). */
function hasImageFill(n: FreeNode): { image: boolean; ref?: string } {
  const fills = Array.isArray(n.fills) ? n.fills : n.fill ? [n.fill] : []
  for (const f of fills) {
    if (f && typeof f === 'object') {
      const pattern = (f as Record<string, unknown>).pattern as Record<string, unknown> | undefined
      const img = pattern?.image ?? (f as Record<string, unknown>).image
      if (typeof img === 'string') return { image: true, ref: img }
    }
  }
  return { image: false }
}

/** Map a raw px value to the nearest spacing token, else a px string. */
const SPACE_TOKENS: Array<[number, string]> = [
  [8, 'var(--space-xs)'],
  [12, 'var(--space-sm)'],
  [16, 'var(--space-md)'],
  [24, 'var(--space-lg)'],
  [32, 'var(--space-xl)'],
  [48, 'var(--space-2xl)'],
  [64, 'var(--space-3xl)'],
  [96, 'var(--space-4xl)'],
]
export function spaceToken(px: number): string {
  if (!(px > 0)) return '0'
  let best = SPACE_TOKENS[0]
  for (const t of SPACE_TOKENS) if (Math.abs(t[0] - px) < Math.abs(best[0] - px)) best = t
  // Snap only when close (±6px); otherwise keep the exact value.
  return Math.abs(best[0] - px) <= 6 ? best[1] : `${Math.round(px)}px`
}

/** FREE encodes text alignment inconsistently; read the common shapes, else undefined. */
function explicitTextAlign(n: FreeNode): TextAlign | undefined {
  const a = n.textAlign ?? (n.textStyle?.align as unknown) ?? (n.style?.textAlign as unknown)
  if (typeof a === 'string') {
    const s = a.toLowerCase()
    if (s.startsWith('l')) return 'left'
    if (s.startsWith('c') || s === 'middle') return 'center'
    if (s.startsWith('r')) return 'right'
  }
  if (typeof a === 'number')
    return a === 0 ? 'left' : a === 1 ? 'right' : a === 2 ? 'center' : undefined
  return undefined
}

/**
 * Classify a leaf/branch node. TEXT is split into heading vs paragraph later
 * (relative to its frame's largest text); here we only separate structural kinds.
 */
function roleOf(n: FreeNode): { role: LayoutRole; imageRef?: string } {
  const t = String(n._t ?? '').toUpperCase()
  if (t === 'TEXT') return { role: 'paragraph' } // refined in a later pass
  if (t === 'INSTANCE') return { role: 'icon' }
  if (IMAGE_TYPES.has(t)) {
    const f = hasImageFill(n)
    if (f.image) return { role: 'image', imageRef: f.ref }
    return { role: 'unknown' } // a plain rect (divider/background) — not an asset slot
  }
  if (CONTAINER_TYPES.has(t)) {
    // A pill/button: a small FRAME whose only meaningful child is a single TEXT.
    const kids = Array.isArray(n.layers) ? n.layers : []
    const texts = kids.filter((k) => String(k._t).toUpperCase() === 'TEXT')
    if (kids.length <= 2 && texts.length === 1 && size(n)[1] <= 72) return { role: 'button' }
    return { role: 'container' }
  }
  return { role: 'unknown' }
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

/**
 * Infer flex direction + alignItems + justifyContent + gap of a container from
 * its children's boxes. This is the signal that would have caught the header /
 * hero / testimonials alignment bugs.
 */
function inferFlex(container: { x: number; y: number; w: number; h: number }, kids: LayoutNode[]) {
  const out: Partial<LayoutNode> = {}
  const items = kids.filter((k) => k.role !== 'unknown')
  if (items.length === 0) return out
  if (items.length < 2) {
    out.flexDirection = 'column'
    return out
  }

  // Direction by packing: a ROW's items tile the horizontal extent (their widths
  // sum to ~the total width, little X overlap) while stacked COLUMN items share
  // the same X band (widths overlap → sum exceeds the extent). Comparing the two
  // packing ratios is robust to a child being indented within a column (which a
  // naive origin-span comparison gets wrong).
  const minL = Math.min(...items.map((k) => k.bbox.x))
  const maxR = Math.max(...items.map((k) => k.bbox.x + k.bbox.w))
  const minT = Math.min(...items.map((k) => k.bbox.y))
  const maxB = Math.max(...items.map((k) => k.bbox.y + k.bbox.h))
  const sumW = items.reduce((a, k) => a + k.bbox.w, 0)
  const sumH = items.reduce((a, k) => a + k.bbox.h, 0)
  const hPack = sumW / Math.max(1, maxR - minL) // ~1 row, >1 column
  const vPack = sumH / Math.max(1, maxB - minT) // >1 row, ~1 column
  const dir: 'row' | 'column' = hPack <= vPack ? 'row' : 'column'
  out.flexDirection = dir

  const tolX = Math.max(8, container.w * 0.02)
  const tolY = Math.max(8, container.h * 0.02)

  if (dir === 'row') {
    // Cross axis = vertical → alignItems from shared vertical edge.
    const tops = items.map((k) => k.bbox.y - container.y)
    const bottoms = items.map((k) => container.y + container.h - (k.bbox.y + k.bbox.h))
    const centers = items.map((k) => k.bbox.y + k.bbox.h / 2 - (container.y + container.h / 2))
    if (tops.every((v) => near(v, tops[0], tolY)) && Math.min(...tops) < container.h * 0.25)
      out.alignItems = 'flex-start'
    else if (
      bottoms.every((v) => near(v, bottoms[0], tolY)) &&
      Math.min(...bottoms) < container.h * 0.25
    )
      out.alignItems = 'flex-end'
    else if (centers.every((v) => near(v, 0, tolY))) out.alignItems = 'center'
    else out.alignItems = 'flex-start'

    // Main axis = horizontal → justifyContent.
    const sorted = [...items].sort((a, b) => a.bbox.x - b.bbox.x)
    const leftGap = sorted[0].bbox.x - container.x
    const rightGap =
      container.x +
      container.w -
      (sorted[sorted.length - 1].bbox.x + sorted[sorted.length - 1].bbox.w)
    if (items.length >= 2 && leftGap < tolX && rightGap < tolX) out.justifyContent = 'space-between'
    else if (near(leftGap, rightGap, tolX * 2)) out.justifyContent = 'center'
    else out.justifyContent = 'flex-start'
    out.gap = medianGap(sorted, 'x', 'w')
  } else {
    // Column: cross axis = horizontal → alignItems from shared horizontal edge.
    const lefts = items.map((k) => k.bbox.x - container.x)
    const rights = items.map((k) => container.x + container.w - (k.bbox.x + k.bbox.w))
    const centers = items.map((k) => k.bbox.x + k.bbox.w / 2 - (container.x + container.w / 2))
    if (lefts.every((v) => near(v, lefts[0], tolX)) && Math.min(...lefts) < container.w * 0.25)
      out.alignItems = 'flex-start'
    else if (
      rights.every((v) => near(v, rights[0], tolX)) &&
      Math.min(...rights) < container.w * 0.25
    )
      out.alignItems = 'flex-end'
    else if (centers.every((v) => near(v, 0, tolX))) out.alignItems = 'center'
    else out.alignItems = 'flex-start'
    out.justifyContent = 'flex-start'
    const sorted = [...items].sort((a, b) => a.bbox.y - b.bbox.y)
    out.gap = medianGap(sorted, 'y', 'h')
  }
  return out
}

function medianGap(sorted: LayoutNode[], axis: 'x' | 'y', dim: 'w' | 'h'): number {
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    gaps.push(sorted[i].bbox[axis] - (prev.bbox[axis] + prev.bbox[dim]))
  }
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  const g = gaps[Math.floor(gaps.length / 2)]
  return g > 0 ? g : 0
}

/** A box is "inside" another when most of it overlaps the other. */
function contained(inner: LayoutNode['bbox'], outer: LayoutNode['bbox']): boolean {
  const ix = Math.max(inner.x, outer.x)
  const iy = Math.max(inner.y, outer.y)
  const ax = Math.min(inner.x + inner.w, outer.x + outer.w)
  const ay = Math.min(inner.y + inner.h, outer.y + outer.h)
  const overlap = Math.max(0, ax - ix) * Math.max(0, ay - iy)
  const area = Math.max(1, inner.w * inner.h)
  return overlap / area >= 0.6 && inner.w <= outer.w && inner.h <= outer.h
}

// ── stage 1: FREE → LayoutNode[] ─────────────────────────────────────────────

export interface NormalizeOpts {
  viewportWidth?: number
}

let idCounter = 0
let runPrefix = 'pb'
function freshBlockId(role: LayoutRole): string {
  idCounter += 1
  return `${runPrefix}-${role.slice(0, 4)}-${idCounter}`
}

export function normalizeFreeFrame(free: FreeNode, opts: NormalizeOpts = {}): LayoutFacts {
  idCounter = 0
  // A short unique token per call so blockIds from different sections never
  // collide when their scaffolds/expectations are merged onto one page.
  runPrefix = `pb${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`
  const warnings: string[] = []
  const [fw] = size(free)
  const viewportW = opts.viewportWidth || fw || 1440

  // The frame's own origin is the coordinate zero.
  const [fx, fy] = pos(free)

  function walk(n: FreeNode, ox: number, oy: number, order: number): LayoutNode {
    const [px, py] = pos(n)
    const [w, h] = size(n)
    const x = ox + px
    const y = oy + py
    const { role, imageRef } = roleOf(n)
    const node: LayoutNode = {
      blockId: freshBlockId(role),
      srcId: typeof n.id === 'string' ? n.id : undefined,
      name: typeof n.name === 'string' ? n.name : undefined,
      role,
      bbox: { x, y, w, h },
      order,
      children: [],
    }
    if (typeof n.text === 'string' && n.text.trim()) node.text = n.text
    if (imageRef) node.imageRef = imageRef
    if (String(n._t).toUpperCase() === 'INSTANCE') {
      node.isInstance = true
      node.instanceName = typeof n.name === 'string' ? n.name : undefined
      if (w <= 64 && h <= 64) node.role = 'badge'
    }
    const ta = explicitTextAlign(n)
    if (ta) node.textAlign = ta

    const kids = Array.isArray(n.layers) ? n.layers : []
    node.children = kids.map((k, i) => walk(k, x, y, i))

    if (node.role === 'container') {
      Object.assign(node, inferFlex(node.bbox, node.children))
    }
    return node
  }

  const roots = (Array.isArray(free.layers) ? free.layers : []).map((k, i) => walk(k, fx, fy, i))

  // Second pass: classify TEXT (heading vs paragraph vs button-label) and infer
  // text-align from position-in-parent where the design left it implicit; detect
  // overlays (badges/icons/instances sitting on top of an image sibling).
  refineText(roots, warnings)
  detectOverlays(roots)

  return {
    viewportW,
    frameId: free.id,
    frameName: typeof free.name === 'string' ? free.name : undefined,
    idPrefix: runPrefix,
    nodes: roots,
    warnings,
  }
}

/** Largest text in a subtree becomes a heading; the rest are paragraphs/labels. */
function refineText(nodes: LayoutNode[], warnings: string[]) {
  const texts: LayoutNode[] = []
  const collect = (arr: LayoutNode[]) => {
    for (const n of arr) {
      if ((n.role === 'paragraph' || n.role === 'heading' || n.role === 'label') && n.text)
        texts.push(n)
      collect(n.children)
    }
  }
  collect(nodes)
  if (!texts.length) return
  const maxH = Math.max(...texts.map((t) => t.bbox.h))
  for (const t of texts) {
    // Big text ⇒ heading; short (<= ~3 words) small text ⇒ label; else paragraph.
    if (t.bbox.h >= maxH * 0.75 && t.bbox.h >= 28) t.role = 'heading'
    else if ((t.text ?? '').trim().split(/\s+/).length <= 3 && t.bbox.h < 24) t.role = 'label'
    else t.role = 'paragraph'
    // Infer text-align from horizontal centering within the parent when implicit.
    if (!t.textAlign) t.textAlign = inferTextAlignFromBox(t, nodes)
  }
  if (texts.some((t) => !t.textAlign))
    warnings.push('Some text alignment was inferred from position; verify centred headings.')
}

/** Center of the text box vs center of the frame width → left/center/right. */
function inferTextAlignFromBox(t: LayoutNode, roots: LayoutNode[]): TextAlign {
  const parent = findParent(roots, t)
  const box = parent ? parent.bbox : rootBounds(roots)
  const cLeft = t.bbox.x - box.x
  const cRight = box.x + box.w - (t.bbox.x + t.bbox.w)
  const tol = Math.max(12, box.w * 0.03)
  if (near(cLeft, cRight, tol)) return 'center'
  return cLeft <= cRight ? 'left' : 'right'
}

function findParent(
  nodes: LayoutNode[],
  target: LayoutNode,
  parent?: LayoutNode
): LayoutNode | undefined {
  for (const n of nodes) {
    if (n === target) return parent
    const r = findParent(n.children, target, n)
    if (r !== undefined) return r
  }
  return undefined
}
function rootBounds(nodes: LayoutNode[]): LayoutNode['bbox'] {
  const xs = nodes.map((n) => n.bbox.x)
  const ys = nodes.map((n) => n.bbox.y)
  const rx = Math.max(...nodes.map((n) => n.bbox.x + n.bbox.w))
  const by = Math.max(...nodes.map((n) => n.bbox.y + n.bbox.h))
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: rx - Math.min(...xs),
    h: by - Math.min(...ys),
  }
}

/**
 * Feature 3 — overlay ingestion. Any badge/icon/instance whose box sits inside an
 * image sibling becomes an overlay of that image, with left/top as a percentage
 * of the image box. Repeated "+" hotspots fall out of this rule automatically.
 */
export function detectOverlays(nodes: LayoutNode[]) {
  const walk = (arr: LayoutNode[]) => {
    const images = arr.filter((n) => n.role === 'image')
    for (const n of arr) {
      if (n.role === 'badge' || n.role === 'icon' || n.isInstance) {
        const host = images.find((img) => img !== n && contained(n.bbox, img.bbox))
        if (host) {
          n.overlayOf = host.blockId
          n.leftPct = round1(((n.bbox.x - host.bbox.x) / host.bbox.w) * 100)
          n.topPct = round1(((n.bbox.y - host.bbox.y) / host.bbox.h) * 100)
        }
      }
      walk(n.children)
    }
  }
  walk(nodes)
}
const round1 = (v: number) => Math.round(v * 10) / 10

// ── stage 2: LayoutNode[] → Puck scaffold ────────────────────────────────────

type Block = { type: string; props: Record<string, unknown> }

export interface ScaffoldOpts {
  /** Wrap the whole scaffold in a Section→Container band (default true). */
  wrapSection?: boolean
}

export function scaffoldFromLayout(
  facts: LayoutFacts,
  opts: ScaffoldOpts = {}
): { root: { props: {} }; content: Block[] } {
  const wrap = opts.wrapSection !== false
  const content = emitChildren(facts.nodes)
  if (!wrap) return { root: { props: {} }, content }
  const band: Block = {
    type: 'Section',
    props: {
      id: `${facts.idPrefix}-section`,
      padding: 'var(--space-3xl) 0',
      content: [
        {
          type: 'Container',
          props: {
            id: `${facts.idPrefix}-container`,
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--space-lg)',
            content,
          },
        },
      ],
    },
  }
  return { root: { props: {} }, content: [band] }
}

function emit(n: LayoutNode): Block | null {
  switch (n.role) {
    case 'heading':
      return {
        type: 'Heading',
        props: clean({ id: n.blockId, text: n.text ?? 'Heading', level: '2', align: n.textAlign }),
      }
    case 'paragraph':
      return {
        type: 'Paragraph',
        props: clean({ id: n.blockId, text: n.text ?? 'Supporting text.', align: n.textAlign }),
      }
    case 'label':
      return {
        type: 'Text',
        props: clean({ id: n.blockId, text: n.text ?? 'Label', align: n.textAlign }),
      }
    case 'button':
      return {
        type: 'Button',
        props: clean({ id: n.blockId, label: n.text ?? 'Button', href: '#', variant: 'custom' }),
      }
    case 'image':
      // Overlays are the image's SIBLINGS in the design tree, so they're grouped
      // in emitChildren (not here); a directly-emitted image carries none.
      return emitImage(n, [])
    case 'icon':
    case 'badge':
      // Overlay markers are emitted with their host image (emitChildren); a
      // free-standing icon becomes an Icon block for the model to name.
      if (n.overlayOf) return null
      return { type: 'Icon', props: clean({ id: n.blockId, name: 'circle' }) }
    case 'container':
      return emitContainer(n)
    default:
      // Unknown leaf (a plain rect/divider) — skip; the model adds it if needed.
      return n.children.length
        ? emitContainer({ ...n, role: 'container', flexDirection: 'column' })
        : null
  }
}

/**
 * Emit a sibling list, grouping each overlay marker onto its host image (overlays
 * sit as SIBLINGS of the image in the design tree, referencing it by overlayOf).
 */
function emitChildren(nodes: LayoutNode[]): Block[] {
  const overlaysByHost = new Map<string, LayoutNode[]>()
  for (const n of nodes) {
    if (n.overlayOf) {
      const list = overlaysByHost.get(n.overlayOf) ?? []
      list.push(n)
      overlaysByHost.set(n.overlayOf, list)
    }
  }
  const out: Block[] = []
  for (const n of nodes) {
    if (n.overlayOf) continue // emitted with its host image
    if (n.role === 'image') {
      out.push(emitImage(n, overlaysByHost.get(n.blockId) ?? []))
      continue
    }
    const b = emit(n)
    if (b) out.push(b)
  }
  return out
}

function emitContainer(n: LayoutNode): Block {
  const isRow = n.flexDirection === 'row'
  const children = emitChildren(n.children)
  return {
    type: isRow ? 'HFlex' : 'VFlex',
    props: clean({
      id: n.blockId,
      display: 'flex',
      flexDirection: n.flexDirection ?? 'column',
      alignItems: n.alignItems,
      justifyContent: n.justifyContent,
      gap: n.gap ? spaceToken(n.gap) : undefined,
      content: children,
    }),
  }
}

/** An image, wrapped in a relative box + absolute markers when it has overlays. */
function emitImage(n: LayoutNode, overlays: LayoutNode[]): Block {
  const img: Block = {
    type: 'Image',
    props: clean({
      id: n.blockId,
      src: '',
      alt: n.name ?? 'Image',
      width: '100%',
      height: 'auto',
      maxWidth: '100%',
    }),
  }
  if (!overlays.length) return img
  const markers: Block[] = overlays.map((o) => ({
    type: 'DivBlock',
    props: clean({
      id: o.blockId,
      position: 'absolute',
      left: `${o.leftPct}%`,
      top: `${o.topPct}%`,
      width: '44px',
      height: '44px',
      borderRadius: '999px',
      bg: 'rgba(255,255,255,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '2',
      content: [
        {
          type: 'Text',
          props: { id: `${o.blockId}-t`, text: '+', textSize: '24px', lineHeight: '1' },
        },
      ],
    }),
  }))
  return {
    type: 'DivBlock',
    props: {
      id: `${n.blockId}-wrap`,
      position: 'relative',
      width: '100%',
      maxWidth: `${Math.round(n.bbox.w)}px`,
      content: [img, ...markers],
    },
  }
}

/** Drop undefined props so the emitted block is clean. */
function clean(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out
}

// ── expectations (compact, stored on the brief for the layout lint) ──────────

export interface LayoutExpectation {
  role: LayoutRole
  textAlign?: TextAlign
  flexDirection?: 'row' | 'column'
  alignItems?: Align
  justifyContent?: string
  /** This node is an overlay marker on an image (lint asserts it renders). */
  isOverlay?: boolean
  overlayOf?: string
}

/**
 * Flatten the facts to a `{ blockId: expectation }` map — small enough to store on
 * the page's design brief (`brief.layout.expects`) and the thing the layout lint
 * diffs the rendered geometry against. Keyed by the SAME blockId the scaffold puts
 * on each Puck block, so built→design matching is a straight id lookup.
 */
export function toExpectations(facts: LayoutFacts): Record<string, LayoutExpectation> {
  const out: Record<string, LayoutExpectation> = {}
  const walk = (arr: LayoutNode[]) => {
    for (const n of arr) {
      if (n.role === 'container') {
        out[n.blockId] = clean2({
          role: n.role,
          flexDirection: n.flexDirection,
          alignItems: n.alignItems,
          justifyContent: n.justifyContent,
        })
      } else if (n.role === 'heading' || n.role === 'paragraph' || n.role === 'label') {
        if (n.textAlign) out[n.blockId] = { role: n.role, textAlign: n.textAlign }
      } else if (n.overlayOf) {
        out[n.blockId] = { role: n.role, isOverlay: true, overlayOf: n.overlayOf }
      }
      walk(n.children)
    }
  }
  walk(facts.nodes)
  return out
}
function clean2(o: LayoutExpectation): LayoutExpectation {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out as unknown as LayoutExpectation
}
