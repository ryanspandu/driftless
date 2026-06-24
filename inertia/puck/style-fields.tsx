import { createElement, type CSSProperties, type ElementType, type ReactNode } from 'react'
import type { Field } from '@measured/puck'
import { cn } from '~/lib/utils'

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

/** Shared style controls — defined once, spread into every block's `fields`. */
export const styleFields: Record<string, Field> = {
  padding: { type: 'text', label: 'Padding (CSS)' },
  margin: { type: 'text', label: 'Margin (CSS)' },
  maxWidth: { type: 'text', label: 'Max width' },
  align: {
    type: 'select',
    label: 'Text align',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
  bg: { type: 'text', label: 'Background' },
  textColor: { type: 'text', label: 'Text color' },
  font: { type: 'text', label: 'Font family' },
  className: { type: 'text', label: 'Custom class' },

  // --- Enriched, optional controls (additive, backward-compatible) ---
  borderRadius: { type: 'text', label: 'Border radius' },
  borderWidth: { type: 'text', label: 'Border width' },
  borderColor: { type: 'text', label: 'Border color' },
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
  width: { type: 'text', label: 'Width' },
  minHeight: { type: 'text', label: 'Min height' },
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
    borderRadius: str(s, 'borderRadius'),
    width: str(s, 'width'),
    minHeight: str(s, 'minHeight'),
    fontSize: str(s, 'textSize'),
    fontWeight: str(s, 'fontWeight') as CSSProperties['fontWeight'],
    lineHeight: str(s, 'lineHeight'),
  }

  if (str(s, 'maxWidth')) {
    css.marginLeft = 'auto'
    css.marginRight = 'auto'
  }

  const borderWidth = str(s, 'borderWidth')
  if (borderWidth) {
    css.border = `${borderWidth} solid ${str(s, 'borderColor') || 'currentColor'}`
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
}: {
  s?: StyleBag
  as?: ElementType
  className?: string
  style?: CSSProperties
  children?: ReactNode
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
