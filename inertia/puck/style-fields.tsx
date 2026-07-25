import { createElement, type CSSProperties, type ElementType, type ReactNode } from 'react'
import type { Field } from '@measured/puck'
import { cn } from '~/lib/utils'
import { AlignControl, BoxModelControl, ColorControl, NumberUnitControl } from '~/puck/style-controls'

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
    background: str(s, 'bg'),
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

  if (str(s, 'maxWidth')) {
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
  const hidden = s._hidden === true
  const isEditing = !!(s.puck as { isEditing?: boolean } | undefined)?.isEditing
  if (hidden && !isEditing) return null
  return createElement(
    as,
    {
      ...rest,
      className: cn(className, str(s, 'className')),
      style: { ...styleToCss(s), ...style, ...(hidden ? { opacity: 0.4 } : null) },
    },
    children
  )
}

/** Responsive preview breakpoints for `<Puck viewports={...}>`. */
export const builderViewports = [
  { width: 390, height: 'auto', label: 'Mobile' },
  { width: 768, height: 'auto', label: 'Tablet' },
  { width: 1280, height: 'auto', label: 'Desktop' },
] as const
