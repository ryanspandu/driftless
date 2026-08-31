import {
  createElement,
  Fragment,
  useContext,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'
import type { Field } from '@measured/puck'
import { cn } from '~/lib/utils'
import {
  AlignControl,
  BoxModelControl,
  ColorControl,
  NumberUnitControl,
} from '~/puck/style-controls'
import { backgroundsToCss, readLayers } from '~/puck/background-layers'
import { scrollAnimationAttrs } from '~/puck/scroll-animation'
import {
  BreakpointContext,
  cascadeStyleBag,
  orderBreakpoints,
  readResponsive,
  type Breakpoint,
} from '~/puck/breakpoints'

/**
 * Shared style controls for the Pages builder ("enrich toward Webflow").
 *
 * Defined once and spread into every block's `fields`, so new style controls
 * (border, shadow, typography, per-breakpoint…) are added in ONE place and
 * inherited everywhere. Block props are plain JSON, so every key is additive —
 * enriching the controls needs no migration.
 *
 * SSR-safe: `Box` renders via `createElement` and touches no window/document,
 * so it is safe to import into the SSR render path.
 */

/** Box-shadow presets → real CSS box-shadow values. */
const boxShadowPresets: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
}

/**
 * Shared style controls — defined once, spread into every block's `fields`.
 *
 * Ordered into logical groups (spacing → size → typography → background →
 * border) and using Webflow-style visual controls for the high-traffic ones
 * (see style-controls.tsx). All values stay plain CSS strings, so this is
 * additive & backward-compatible — no data migration.
 */
export const styleFields: Record<string, Field> = {
  // Spacing
  padding: {
    type: 'custom',
    label: 'Padding',
    render: ({ value, onChange }) => <BoxModelControl value={value} onChange={onChange} />,
  },
  margin: {
    type: 'custom',
    label: 'Margin',
    render: ({ value, onChange }) => <BoxModelControl value={value} onChange={onChange} />,
  },

  // Size
  maxWidth: {
    type: 'custom',
    label: 'Max width',
    render: ({ value, onChange }) => <NumberUnitControl value={value} onChange={onChange} />,
  },
  width: {
    type: 'custom',
    label: 'Width',
    render: ({ value, onChange }) => <NumberUnitControl value={value} onChange={onChange} />,
  },
  minHeight: {
    type: 'custom',
    label: 'Min height',
    render: ({ value, onChange }) => <NumberUnitControl value={value} onChange={onChange} />,
  },

  // Typography
  textSize: { type: 'text', label: 'Font size' },
  fontWeight: {
    type: 'select',
    label: 'Font weight',
    options: [
      { label: 'Regular (400)', value: '400' },
      { label: 'Medium (500)', value: '500' },
      { label: 'Semibold (600)', value: '600' },
      { label: 'Bold (700)', value: '700' },
    ],
  },
  lineHeight: { type: 'text', label: 'Line height' },
  font: { type: 'text', label: 'Font family' },
  textColor: {
    type: 'custom',
    label: 'Text color',
    render: ({ value, onChange }) => <ColorControl value={value} onChange={onChange} />,
  },
  align: {
    type: 'custom',
    label: 'Text align',
    render: ({ value, onChange }) => <AlignControl value={value} onChange={onChange} />,
  },

  // Background
  bg: {
    type: 'custom',
    label: 'Background',
    render: ({ value, onChange }) => <ColorControl value={value} onChange={onChange} />,
  },

  // Border & effects
  borderWidth: {
    type: 'custom',
    label: 'Border width',
    render: ({ value, onChange }) => <NumberUnitControl value={value} onChange={onChange} />,
  },
  borderColor: {
    type: 'custom',
    label: 'Border color',
    render: ({ value, onChange }) => <ColorControl value={value} onChange={onChange} />,
  },
  borderRadius: {
    type: 'custom',
    label: 'Border radius',
    render: ({ value, onChange }) => <NumberUnitControl value={value} onChange={onChange} />,
  },
  boxShadow: {
    type: 'select',
    label: 'Box shadow',
    options: [
      { label: 'None', value: '' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
    ],
  },

  // Advanced
  className: { type: 'text', label: 'Custom class' },
}

/** Block props are loose JSON; read style keys defensively. */
type StyleBag = Record<string, unknown>

function str(s: StyleBag, key: string): string | undefined {
  return typeof s[key] === 'string' ? (s[key] as string) : undefined
}

function styleToCss(s: StyleBag): CSSProperties {
  const css: CSSProperties = {
    padding: str(s, 'padding'),
    margin: str(s, 'margin'),
    maxWidth: str(s, 'maxWidth'),
    color: str(s, 'textColor'),
    fontFamily: str(s, 'font'),
    textAlign: str(s, 'align') as CSSProperties['textAlign'],
    textDecoration: str(s, 'textDecoration'),
    borderRadius: str(s, 'borderRadius'),
    width: str(s, 'width'),
    height: str(s, 'height'),
    minWidth: str(s, 'minWidth'),
    minHeight: str(s, 'minHeight'),
    maxHeight: str(s, 'maxHeight'),
    overflow: str(s, 'overflow') as CSSProperties['overflow'],
    display: str(s, 'display'),
    flexDirection: str(s, 'flexDirection') as CSSProperties['flexDirection'],
    justifyContent: str(s, 'justifyContent'),
    alignItems: str(s, 'alignItems'),
    gap: str(s, 'gap'),
    position: str(s, 'position') as CSSProperties['position'],
    top: str(s, 'top'),
    right: str(s, 'right'),
    bottom: str(s, 'bottom'),
    left: str(s, 'left'),
    zIndex: str(s, 'zIndex') as CSSProperties['zIndex'],
    fontSize: str(s, 'textSize'),
    fontWeight: str(s, 'fontWeight') as CSSProperties['fontWeight'],
    lineHeight: str(s, 'lineHeight'),
    letterSpacing: str(s, 'letterSpacing'),
    textIndent: str(s, 'textIndent'),
    textTransform: str(s, 'textTransform') as CSSProperties['textTransform'],
    fontStyle: str(s, 'fontStyle') as CSSProperties['fontStyle'],
    direction: str(s, 'direction') as CSSProperties['direction'],
    whiteSpace: str(s, 'whiteSpace') as CSSProperties['whiteSpace'],
    mixBlendMode: str(s, 'mixBlendMode') as CSSProperties['mixBlendMode'],
    opacity: str(s, 'opacity') as CSSProperties['opacity'],
    cursor: str(s, 'cursor'),
    alignSelf: str(s, 'alignSelf') as CSSProperties['alignSelf'],
    order: str(s, 'order') as CSSProperties['order'],
    flexGrow: str(s, 'flexGrow') as CSSProperties['flexGrow'],
    flexShrink: str(s, 'flexShrink') as CSSProperties['flexShrink'],
    flexBasis: str(s, 'flexBasis'),
    float: str(s, 'float') as CSSProperties['float'],
    clear: str(s, 'clear') as CSSProperties['clear'],
    transform: str(s, 'transform'),
    transition: str(s, 'transition'),
    filter: str(s, 'filter'),
  }

  /**
   * Background: a base colour, optionally under a stack of layers.
   *
   * With no layers this keeps writing the `background` **shorthand** exactly as
   * it always did, so every page built before layers existed renders byte for
   * byte. With layers, the colour has to move to `backgroundColor` — the
   * shorthand resets `background-image`, and would wipe the stack out.
   */
  const layers = backgroundsToCss(readLayers(s.backgrounds))
  if (layers) {
    css.backgroundColor = str(s, 'bg')
    Object.assign(css, layers)
  } else {
    css.background = str(s, 'bg')
  }

  /**
   * A capped block with no margin of its own centres itself — what an author
   * means by "max width 1100px" almost always includes "in the middle".
   *
   * But only when they have not said otherwise. This used to centre
   * unconditionally, writing `marginLeft/Right: auto` over an authored `margin`
   * (longhand beats shorthand), so a Container with `margin: 0 0 0 40px` sat
   * centred and the left offset simply vanished with nothing to explain it.
   * An explicit margin now wins outright; `auto` typed into the left/right
   * boxes still centres.
   */
  if (str(s, 'maxWidth') && !str(s, 'margin')) {
    css.marginLeft = 'auto'
    css.marginRight = 'auto'
  }

  const borderWidth = str(s, 'borderWidth')
  const borderStyle = str(s, 'borderStyle')
  if (borderWidth || borderStyle) {
    css.border = `${borderWidth || '1px'} ${borderStyle || 'solid'} ${str(s, 'borderColor') || 'currentColor'}`
  }

  const shadow = str(s, 'boxShadow')
  if (shadow) {
    css.boxShadow = boxShadowPresets[shadow] ?? shadow
  }

  return css
}

/**
 * Names a custom attribute may never set: either managed by the builder
 * elsewhere (class/id via their own fields, style via the style panel, React
 * internals) or an XSS vector. `id` is allowed only through the dedicated `htmlId`
 * field, never as a free-form attribute.
 */
const BLOCKED_ATTRS = new Set([
  'class',
  'classname',
  'id',
  'style',
  'ref',
  'key',
  'srcdoc',
  'dangerouslysetinnerhtml',
])

/**
 * The element's custom `id` + arbitrary name/value attributes (Element panel →
 * Attributes), emitted onto the DOM. Filtered for safety: valid attribute names
 * only, no `on*` event handlers, no managed/unsafe names, and no `javascript:`
 * values. Both the editor and the published page run through here, so the guard
 * is consistent.
 */
function customAttributes(s: StyleBag): Record<string, string> {
  const out: Record<string, string> = {}

  const htmlId = str(s, 'htmlId')?.trim()
  if (htmlId) out.id = htmlId

  const list = s.attributes
  if (Array.isArray(list)) {
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue
      const name = String((raw as { name?: unknown }).name ?? '').trim()
      const value = String((raw as { value?: unknown }).value ?? '')
      if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) continue // valid attribute name
      if (/^on/i.test(name)) continue // no event handlers
      if (BLOCKED_ATTRS.has(name.toLowerCase())) continue
      if (/^\s*javascript:/i.test(value)) continue // no javascript: URLs
      out[name] = value
    }
  }
  return out
}

// ─────────────── Responsive (per-breakpoint) CSS generation ───────────────

/**
 * A style value is safe to drop into a generated `<style>` when it can't break
 * out of its declaration or the tag: `{`/`}` would open a new rule, `<`/`>` could
 * close `</style>` and inject markup, and `@import`/`expression()`/
 * `url(javascript:)` are the classic CSS-injection vectors. `;`, `()`, `,` are
 * left alone — legitimate in `calc()`, `rgba()`, `url(data:…;base64,…)`, and
 * without braces a stray `;` can only add a declaration to this same element's
 * rule, which the author already controls.
 */
function isSafeCssValue(v: string): boolean {
  return (
    !/[<>{}]/.test(v) &&
    !/@import/i.test(v) &&
    !/expression\s*\(/i.test(v) &&
    !/url\s*\(\s*['"]?\s*javascript:/i.test(v)
  )
}

/** Serialise a React style object to a sanitised CSS declaration string. */
function styleObjectToCssText(obj: CSSProperties): string {
  let out = ''
  for (const key of Object.keys(obj)) {
    const raw = (obj as Record<string, unknown>)[key]
    if (raw == null || raw === '') continue
    const value = String(raw)
    if (!isSafeCssValue(value)) continue
    const prop = key.startsWith('--') ? key : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    out += `${prop}:${value};`
  }
  return out
}

/** Puck block ids are safe selector tokens; guard anyway before building CSS. */
function safeBlockId(s: StyleBag): string | null {
  const id = str(s, 'id')
  return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null
}

/**
 * The published-page stylesheet for a block that has per-breakpoint overrides:
 * a base rule (its flat props) plus one `@media (max-width: N)` rule per tier
 * that overrides something, emitted widest → narrowest so the narrower tier wins
 * on a specificity tie. Scoped by `[data-b="<id>"]`. Empty when nothing applies.
 */
function responsiveCss(s: StyleBag, breakpoints: Breakpoint[], id: string): string {
  const sel = `[data-b="${id}"]`
  const responsive = readResponsive(s)
  let out = ''

  const base = styleObjectToCssText(styleToCss(s))
  if (base) out += `${sel}{${base}}`

  for (const bp of orderBreakpoints(breakpoints)) {
    if (bp.maxWidth === null) continue
    const override = responsive[bp.id]
    if (!override) continue
    const delta = styleObjectToCssText(styleToCss(override))
    if (delta) out += `@media (max-width:${bp.maxWidth}px){${sel}{${delta}}}`
  }
  return out
}

export function Box({
  s = {},
  as = 'div',
  className,
  style,
  children,
  ...rest
}: {
  s?: StyleBag
  as?: ElementType
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** Extra DOM attributes forwarded to the element (e.g. `href`/`target` for links). */
  [key: string]: unknown
}) {
  // `_hidden` (toggled from the Layers panel) hides the block on the published
  // page / SSR (render nothing). In the editor (`puck.isEditing`) it stays
  // visible but dimmed so it can still be selected and un-hidden. `puck` is spread
  // into `s` by Puck; when absent (e.g. plain SSR) we simply hide it.
  const puck = s.puck as { isEditing?: boolean; dragRef?: (el: Element | null) => void } | undefined
  const hidden = s._hidden === true
  const isEditing = !!puck?.isEditing
  if (hidden && !isEditing) return null

  // Scroll-into-view reveal: data-attrs + inert CSS custom properties, applied
  // only on the published page (suppressed while editing). The hidden start
  // state lives in `.sa-active`-gated CSS, never in this inline style — so SSR
  // and no-JS keep the element visible.
  const anim = scrollAnimationAttrs(s, isEditing)

  /*
   * Responsive breakpoints. A block with no `responsive` overrides renders
   * exactly as before (inline `styleToCss`). Otherwise:
   *   • Editor — the fixed-width canvas can't honour real `@media`, so flatten
   *     the currently-previewed breakpoint (`activeBp`) to inline styles.
   *   • Published — move ALL of this block's style props into a generated
   *     `@media` stylesheet keyed by `data-b` (inline would out-specify the media
   *     rules) and drop the inline style props. Non-responsive blocks keep the
   *     inline path untouched, so existing pages are byte-for-byte identical.
   */
  const { breakpoints, activeBp } = useContext(BreakpointContext)
  const hasResponsive = Object.keys(readResponsive(s)).length > 0
  const bId = hasResponsive ? safeBlockId(s) : null
  const useStylesheet = !isEditing && !!bId
  const styleBag = isEditing && hasResponsive ? cascadeStyleBag(s, breakpoints, activeBp) : s

  // For components marked `inline: true`, Puck skips its own drag wrapper and
  // hands us a `dragRef` to put on the real element instead — so the block is
  // itself the flex/grid item (matching the published DOM) while Puck still
  // tracks/selects/drags it. `null` for non-inline blocks (React ignores it).
  const el = createElement(
    as,
    {
      ...rest,
      ...anim.attrs,
      ...customAttributes(s),
      ...(useStylesheet ? { 'data-b': bId } : null),
      ref: puck?.dragRef,
      className: cn(className, str(s, 'className')),
      style: {
        // When the stylesheet owns the style props, keep only the non-style
        // inline bits (scroll-anim vars, a block's own hardcoded `style`, the
        // editor's dimmed-hidden marker).
        ...(useStylesheet ? null : styleToCss(styleBag)),
        ...anim.vars,
        ...style,
        ...(hidden ? { opacity: 0.4 } : null),
      },
    },
    children
  )

  if (useStylesheet && bId) {
    const css = responsiveCss(s, breakpoints, bId)
    if (css) {
      // A `<style>` in the body is `display:none` (inert, no layout impact); it
      // is server-rendered so it lands in the SSG snapshot and works with no JS.
      return createElement(
        Fragment,
        null,
        createElement('style', { dangerouslySetInnerHTML: { __html: css } }),
        el
      )
    }
  }
  return el
}

/** Responsive preview breakpoints for `<Puck viewports={...}>`. */
export const builderViewports = [
  { width: 390, height: 'auto', label: 'Mobile' },
  { width: 768, height: 'auto', label: 'Tablet' },
  { width: 1280, height: 'auto', label: 'Desktop' },
] as const
