import { useContext, useState, type ReactNode } from 'react'
import { createUsePuck, type ComponentData, type Field } from '@measured/puck'
import { BreakpointContext, baseBreakpoint, cascadeStyleBag, readResponsive } from './breakpoints'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  Ban,
  ChevronDown,
  Eye,
  EyeOff,
  Italic,
  MousePointer2,
  Plus,
  Strikethrough,
  Trash2,
  Underline,
} from 'lucide-react'
import { cn } from '~/lib/utils'
import {
  BoxModelControl,
  BoxShadowControl,
  ColorControl,
  CommitInput,
  CommitTextarea,
  NumberUnitControl,
  OffsetControl,
  SegmentedControl,
  SpacingControl,
  type SegmentedOption,
} from './style-controls'
import { BackgroundLayersControl } from './background-controls'
import type { ScrollAnimationPreset } from './scroll-animation'
import { ICONS, LABELS } from './overrides'

/**
 * Webflow-style Detail panel — replaces Puck's flat `Puck.Fields` with a dense,
 * sectioned, dark settings panel that mirrors Webflow's Style panel:
 *
 *   • bold section headers with a collapse chevron,
 *   • horizontal rows (compact label on the left, control on the right) for
 *     style props, with the label turning blue when the prop is set,
 *   • the nested margin/padding box-model diagram for Spacing,
 *   • the component's own fields (text/image/etc.) in a "Content" section.
 *
 * Reads the selected component from `usePuck()` and writes via `replace`. Data
 * stays plain CSS strings — no migration. Nothing selected → Puck root fields.
 */

const SPACING_KEYS = ['padding', 'margin']
const SIZE_KEYS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'overflow']
const POSITION_KEYS = ['position', 'top', 'right', 'bottom', 'left', 'zIndex', 'float', 'clear']

const FLOAT_OPTIONS: SegmentedOption[] = [
  { value: '', icon: Ban, title: 'None' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

const CLEAR_OPTIONS: SegmentedOption[] = [
  { value: '', icon: Ban, title: 'None' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
]

const POSITION_OPTIONS = [
  { label: 'Static', value: '' },
  { label: 'Relative', value: 'relative' },
  { label: 'Absolute', value: 'absolute' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Sticky', value: 'sticky' },
]

const SIZE_FIELDS: { key: string; label: string }[] = [
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
  { key: 'minWidth', label: 'Min W' },
  { key: 'minHeight', label: 'Min H' },
  { key: 'maxWidth', label: 'Max W' },
  { key: 'maxHeight', label: 'Max H' },
]

const OVERFLOW_OPTIONS: SegmentedOption[] = [
  { value: 'visible', icon: Eye, title: 'Visible' },
  { value: 'hidden', icon: EyeOff, title: 'Hidden' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'auto', label: 'Auto' },
]

const TYPO_KEYS = [
  'font',
  'fontWeight',
  'textSize',
  'lineHeight',
  'textColor',
  'align',
  'textDecoration',
  'letterSpacing',
  'textIndent',
  'textTransform',
  'fontStyle',
  'direction',
  'whiteSpace',
]

const FONTSTYLE_OPTIONS: SegmentedOption[] = [
  { value: '', label: 'Normal', title: 'Normal' },
  { value: 'italic', icon: Italic, title: 'Italic' },
]

const TRANSFORM_OPTIONS: SegmentedOption[] = [
  { value: '', icon: Ban, title: 'None' },
  { value: 'uppercase', label: 'AA', title: 'Uppercase' },
  { value: 'capitalize', label: 'Aa', title: 'Capitalize' },
  { value: 'lowercase', label: 'aa', title: 'Lowercase' },
]

const TEXT_DIR_OPTIONS: SegmentedOption[] = [
  { value: '', label: 'LTR', title: 'Left to right' },
  { value: 'rtl', label: 'RTL', title: 'Right to left' },
]

const WRAP_OPTIONS = [
  { label: 'Normal', value: '' },
  { label: 'No wrap', value: 'nowrap' },
  { label: 'Pre', value: 'pre' },
  { label: 'Pre-wrap', value: 'pre-wrap' },
]

const WEIGHT_OPTIONS = [
  { label: 'Thin (100)', value: '100' },
  { label: 'Light (300)', value: '300' },
  { label: 'Regular (400)', value: '400' },
  { label: 'Medium (500)', value: '500' },
  { label: 'Semibold (600)', value: '600' },
  { label: 'Bold (700)', value: '700' },
  { label: 'Extrabold (800)', value: '800' },
]

const ALIGN_OPTIONS: SegmentedOption[] = [
  { value: 'left', icon: AlignLeft, title: 'Left' },
  { value: 'center', icon: AlignCenter, title: 'Center' },
  { value: 'right', icon: AlignRight, title: 'Right' },
  { value: 'justify', icon: AlignJustify, title: 'Justify' },
]

const DECOR_OPTIONS: SegmentedOption[] = [
  { value: '', icon: Ban, title: 'None' },
  { value: 'underline', icon: Underline, title: 'Underline' },
  { value: 'line-through', icon: Strikethrough, title: 'Strikethrough' },
]

const LAYOUT_KEYS = ['display', 'flexDirection', 'justifyContent', 'alignItems', 'gap']

const DISPLAY_OPTIONS: SegmentedOption[] = [
  { value: 'block', label: 'Block' },
  { value: 'flex', label: 'Flex' },
  { value: 'grid', label: 'Grid' },
  { value: 'none', label: 'None' },
]

const DIRECTION_OPTIONS: SegmentedOption[] = [
  { value: 'row', icon: ArrowRight, title: 'Row' },
  { value: 'column', icon: ArrowDown, title: 'Column' },
]

const JUSTIFY_OPTIONS = [
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Space between', value: 'space-between' },
  { label: 'Space around', value: 'space-around' },
  { label: 'Space evenly', value: 'space-evenly' },
]

const ALIGN_ITEMS_OPTIONS = [
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Stretch', value: 'stretch' },
  { label: 'Baseline', value: 'baseline' },
]

const EFFECTS_KEYS = ['mixBlendMode', 'opacity', 'cursor', 'transform', 'transition', 'filter']

const BLEND_OPTIONS = [
  { label: 'Normal', value: '' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Color dodge', value: 'color-dodge' },
  { label: 'Difference', value: 'difference' },
  { label: 'Exclusion', value: 'exclusion' },
  { label: 'Luminosity', value: 'luminosity' },
]

const CURSOR_OPTIONS = [
  { label: 'Auto', value: '' },
  { label: 'Default', value: 'default' },
  { label: 'Pointer', value: 'pointer' },
  { label: 'Text', value: 'text' },
  { label: 'Move', value: 'move' },
  { label: 'Grab', value: 'grab' },
  { label: 'Not allowed', value: 'not-allowed' },
  { label: 'Crosshair', value: 'crosshair' },
  { label: 'Zoom in', value: 'zoom-in' },
]

const BORDER_KEYS = ['borderStyle', 'borderWidth', 'borderColor', 'borderRadius', 'boxShadow']
const FLEXCHILD_KEYS = ['alignSelf', 'flexGrow', 'flexShrink', 'order', 'flexBasis']
const ADVANCED_KEYS = ['className', 'htmlId', 'attributes']

const BORDER_STYLE_OPTIONS: SegmentedOption[] = [
  { value: '', icon: Ban, title: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

const ALIGN_SELF_OPTIONS = [
  { label: 'Auto', value: '' },
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Stretch', value: 'stretch' },
  { label: 'Baseline', value: 'baseline' },
]

/** `bg` is the base colour; `backgrounds` is the layer stack painted over it. */
const BACKGROUND_KEYS = ['bg', 'backgrounds']

/** Scroll-into-view reveal, stored as one object prop. */
const INTERACTION_KEYS = ['scrollAnimation']

const SCROLL_ANIM_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'Fade', value: 'fade' },
  { label: 'Fade up', value: 'fade-up' },
  { label: 'Fade down', value: 'fade-down' },
  { label: 'Fade left', value: 'fade-left' },
  { label: 'Fade right', value: 'fade-right' },
  { label: 'Zoom in', value: 'zoom-in' },
  { label: 'Zoom out', value: 'zoom-out' },
  { label: 'Flip', value: 'flip' },
] satisfies { label: string; value: '' | ScrollAnimationPreset }[]

const SCROLL_EASING_OPTIONS = [
  { label: 'Ease', value: 'ease' },
  { label: 'Ease in-out', value: 'ease-in-out' },
  { label: 'Ease out', value: 'ease-out' },
  { label: 'Ease in', value: 'ease-in' },
  { label: 'Linear', value: 'linear' },
]

const SCROLL_ONCE_OPTIONS: SegmentedOption[] = [
  { value: 'once', label: 'Once' },
  { value: 'replay', label: 'Replay' },
]

const SCROLL_SLIDE_PRESETS = ['fade-up', 'fade-down', 'fade-left', 'fade-right']

const STYLE_KEYS = new Set([
  ...SPACING_KEYS,
  ...SIZE_KEYS,
  ...POSITION_KEYS,
  ...TYPO_KEYS,
  ...LAYOUT_KEYS,
  ...EFFECTS_KEYS,
  ...BORDER_KEYS,
  ...FLEXCHILD_KEYS,
  ...ADVANCED_KEYS,
  ...BACKGROUND_KEYS,
  ...INTERACTION_KEYS,
])

/**
 * The style keys that CASCADE per breakpoint. Everything visual — layout,
 * spacing, size, position, typography, background, border, effects, flex-child.
 * Deliberately excludes the element's identity (`className`/`htmlId`/custom
 * `attributes`) and scroll interactions, which stay on the base layer regardless
 * of the active breakpoint.
 */
const RESPONSIVE_KEYS = new Set([
  ...SPACING_KEYS,
  ...SIZE_KEYS,
  ...POSITION_KEYS,
  ...TYPO_KEYS,
  ...LAYOUT_KEYS,
  ...EFFECTS_KEYS,
  ...BORDER_KEYS,
  ...FLEXCHILD_KEYS,
  ...BACKGROUND_KEYS,
])

/**
 * Selector-scoped Puck store hook (see builder-shell for the rationale): the
 * panel re-renders when the *selected item* changes, not on every store tick
 * (hover, other-block edits). `config`/`dispatch`/`getSelectorForId` are stable
 * references, so those subscriptions never trigger a re-render.
 */
const usePuckStore = createUsePuck()

export function DetailPanel() {
  const selectedItem = usePuckStore((s) => s.selectedItem)
  const config = usePuckStore((s) => s.config)
  const dispatch = usePuckStore((s) => s.dispatch)
  const getSelectorForId = usePuckStore((s) => s.getSelectorForId)
  const { breakpoints, activeBp } = useContext(BreakpointContext)

  if (!selectedItem) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <MousePointer2 className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">No element selected</p>
        <p className="text-xs text-muted-foreground">
          Select an element on the canvas or in the Layers panel to edit it here.
        </p>
      </div>
    )
  }

  const type = selectedItem.type as string
  const fields = (config.components?.[type]?.fields ?? {}) as Record<string, Field>
  const props = selectedItem.props as Record<string, unknown>
  const id = props.id as string
  const Icon = ICONS[type] ?? null

  // Which breakpoint is being edited. On the base tier, edits write flat props
  // exactly as before. On a narrower tier, STYLE edits write to that tier's
  // override layer (`props.responsive[bp]`); identity/content keys still write
  // to the base. Reads use the desktop-first cascade so the panel shows the
  // effective value at the active tier.
  const baseId = baseBreakpoint(breakpoints)?.id
  const onBase = !activeBp || activeBp === baseId
  const viewProps = onBase ? props : cascadeStyleBag(props, breakpoints, activeBp)

  const update = (patch: Record<string, unknown>) => {
    const sel = getSelectorForId(id)
    if (!sel) return

    let nextProps: Record<string, unknown>
    if (onBase) {
      nextProps = { ...props, ...patch }
    } else {
      nextProps = { ...props }
      const responsive = { ...readResponsive(props) }
      const layer = { ...(responsive[activeBp!] ?? {}) }
      for (const [k, v] of Object.entries(patch)) {
        if (RESPONSIVE_KEYS.has(k)) {
          // Style keys cascade: set on this tier, or prune to fall back to inherited.
          if (v === undefined || v === '' || v === null) delete layer[k]
          else layer[k] = v
        } else {
          // Identity / content keys are never per-breakpoint.
          nextProps[k] = v
        }
      }
      if (Object.keys(layer).length) responsive[activeBp!] = layer
      else delete responsive[activeBp!]
      nextProps.responsive = Object.keys(responsive).length ? responsive : undefined
    }

    dispatch({
      type: 'replace',
      destinationZone: sel.zone,
      destinationIndex: sel.index,
      data: { ...selectedItem, props: nextProps } as ComponentData,
    })
  }

  // Styled blocks spread `styleFields` (so they have `maxWidth`); Spacer/PageOutlet
  // don't — for those we only show their own Content fields.
  const hasStyle = 'maxWidth' in fields
  const contentKeys = Object.keys(fields).filter(
    (k) => (hasStyle ? !STYLE_KEYS.has(k) : true) && fields[k]?.type !== 'slot'
  )
  const hasSpacing = hasStyle && SPACING_KEYS.some((k) => k in fields)

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 border-b px-3 py-2.5 text-sm font-semibold">
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        <span className="min-w-0 flex-1 truncate">
          {(config.components?.[type] as { label?: string } | undefined)?.label ??
            LABELS[type] ??
            type}
        </span>
        {!onBase && (
          <span
            className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-400"
            title={`Editing the ${breakpoints.find((b) => b.id === activeBp)?.label ?? activeBp} breakpoint. Style changes here apply to this width and narrower; class, ID and content stay shared.`}
          >
            {breakpoints.find((b) => b.id === activeBp)?.label ?? activeBp}
          </span>
        )}
      </div>

      {contentKeys.length > 0 && (
        <Section title="Content">
          {contentKeys.map((k) => (
            <FieldRow
              key={k}
              field={fields[k]}
              name={k}
              itemId={id}
              label={fields[k]?.label ?? k}
              value={viewProps[k]}
              onChange={(v) => update({ [k]: v })}
            />
          ))}
        </Section>
      )}

      {hasStyle && <FlexChildSection props={viewProps} update={update} />}

      {hasStyle && <LayoutSection props={viewProps} update={update} hasGap={'gap' in fields} />}

      {hasSpacing && (
        <Section title="Spacing">
          <SpacingControl
            margin={typeof viewProps.margin === 'string' ? viewProps.margin : ''}
            padding={typeof viewProps.padding === 'string' ? viewProps.padding : ''}
            onChange={(margin, padding) => update({ margin, padding })}
          />
        </Section>
      )}

      {hasStyle && <SizeSection props={viewProps} update={update} />}

      {hasStyle && <PositionSection props={viewProps} update={update} />}

      {hasStyle && <TypographySection props={viewProps} update={update} />}

      {'bg' in fields && <BackgroundSection props={viewProps} update={update} />}

      {hasStyle && <BordersSection props={viewProps} update={update} />}

      {hasStyle && <EffectsSection props={viewProps} update={update} />}

      {hasStyle && <InteractionsSection props={viewProps} update={update} />}

      {hasStyle && <AdvancedSection props={viewProps} update={update} />}
    </div>
  )
}

/**
 * Webflow's Backgrounds panel: the base colour, then the layer stack over it.
 *
 * The colour stays a plain `bg` string — it was here before layers existed and
 * every page still uses it — while the stack lives in its own `backgrounds`
 * array. Keeping them separate is what lets a page with no layers compile to
 * exactly the CSS it always did.
 */
function BackgroundSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const bg = typeof props.bg === 'string' ? props.bg : ''
  return (
    <Section title="Backgrounds">
      <InlineRow label="Color" set={!!bg}>
        <ColorControl value={bg} onChange={(v) => update({ bg: v })} />
      </InlineRow>
      <BackgroundLayersControl
        value={props.backgrounds}
        // Stored as `undefined` when empty so an untouched block keeps the exact
        // prop set it had, rather than gaining an empty array on first glance.
        onChange={(layers) => update({ backgrounds: layers.length ? layers : undefined })}
      />
    </Section>
  )
}

function EffectsSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  const opacityRaw = get('opacity')
  const pct = (() => {
    if (!opacityRaw) return 100
    const n = Number.parseFloat(opacityRaw)
    if (Number.isNaN(n)) return 100
    return Math.max(0, Math.min(100, Math.round((n <= 1 ? n : n / 100) * 100)))
  })()
  const setPct = (p: number) =>
    update({ opacity: p >= 100 ? '' : String(Number((p / 100).toFixed(2))) })
  return (
    <Section title="Effects" defaultOpen={false}>
      <InlineRow label="Blend" set={!!get('mixBlendMode')}>
        <select
          className={cn(inputCls, 'cursor-pointer')}
          value={get('mixBlendMode')}
          onChange={(e) => update({ mixBlendMode: e.target.value })}
        >
          {BLEND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>
      <InlineRow label="Opacity" set={opacityRaw !== ''}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-blue-500"
          />
          <div className="flex h-7 items-center rounded-md border border-input bg-background px-1.5">
            <input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-10 bg-transparent text-right text-sm tabular-nums outline-none"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>
      </InlineRow>
      <InlineRow label="Cursor" set={!!get('cursor')}>
        <select
          className={cn(inputCls, 'cursor-pointer')}
          value={get('cursor')}
          onChange={(e) => update({ cursor: e.target.value })}
        >
          {CURSOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>
      <StackField label="Transform" set={!!get('transform')}>
        <CommitInput
          type="text"
          className={inputCls}
          value={get('transform')}
          placeholder="rotate(5deg) scale(1.1)"
          onCommit={(v) => update({ transform: v })}
        />
      </StackField>
      <StackField label="Transition" set={!!get('transition')}>
        <CommitInput
          type="text"
          className={inputCls}
          value={get('transition')}
          placeholder="all 0.2s ease"
          onCommit={(v) => update({ transition: v })}
        />
      </StackField>
      <StackField label="Filter" set={!!get('filter')}>
        <CommitInput
          type="text"
          className={inputCls}
          value={get('filter')}
          placeholder="blur(4px) brightness(1.1)"
          onCommit={(v) => update({ filter: v })}
        />
      </StackField>
    </Section>
  )
}

/**
 * Scroll-into-view reveal animations ("animate on scroll", Webflow's flagship
 * interaction). Stored as one `scrollAnimation` object prop — `undefined` when
 * the type is cleared, mirroring how `backgrounds` stores empty. The reveal
 * fires only on the published page; the runtime never runs in the editor, so
 * the canvas stays still while authoring.
 */
function InteractionsSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const sa =
    props.scrollAnimation && typeof props.scrollAnimation === 'object'
      ? (props.scrollAnimation as Record<string, unknown>)
      : {}
  const get = (k: string) => (typeof sa[k] === 'string' ? (sa[k] as string) : '')
  const type = get('type')
  const isSlide = SCROLL_SLIDE_PRESETS.includes(type)

  const setSA = (patch: Record<string, unknown>) => {
    const next = { ...sa, ...patch }
    // Clearing the preset removes the whole prop so an untouched block keeps its
    // exact prop set (same rule as Backgrounds).
    update({ scrollAnimation: next.type ? next : undefined })
  }

  return (
    <Section title="Interactions" defaultOpen={false}>
      <InlineRow label="Animate" set={!!type}>
        <select
          className={cn(inputCls, 'cursor-pointer')}
          value={type}
          onChange={(e) => setSA({ type: e.target.value })}
        >
          {SCROLL_ANIM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>

      {type ? (
        <>
          <InlineRow label="Easing" set={!!get('easing')}>
            <select
              className={cn(inputCls, 'cursor-pointer')}
              value={get('easing')}
              onChange={(e) => setSA({ easing: e.target.value })}
            >
              {SCROLL_EASING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </InlineRow>

          <div className="grid grid-cols-2 gap-2">
            <StackField label="Duration" set={!!get('duration')}>
              <NumberUnitControl
                value={get('duration')}
                onChange={(v) => setSA({ duration: v })}
                units={['ms', 's']}
              />
            </StackField>
            <StackField label="Delay" set={!!get('delay')}>
              <NumberUnitControl
                value={get('delay')}
                onChange={(v) => setSA({ delay: v })}
                units={['ms', 's']}
              />
            </StackField>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {isSlide ? (
              <StackField label="Distance" set={!!get('distance')}>
                <NumberUnitControl
                  value={get('distance')}
                  onChange={(v) => setSA({ distance: v })}
                  units={['px', 'rem', '%']}
                />
              </StackField>
            ) : null}
            <StackField label="Trigger" set={!!get('threshold')}>
              <NumberUnitControl
                value={get('threshold')}
                onChange={(v) => setSA({ threshold: v })}
                units={['%']}
              />
            </StackField>
          </div>

          <InlineRow label="Replay" set={sa.once === false}>
            <SegmentedControl
              options={SCROLL_ONCE_OPTIONS}
              value={sa.once === false ? 'replay' : 'once'}
              onChange={(v) => setSA({ once: v !== 'replay' })}
            />
          </InlineRow>
        </>
      ) : null}
    </Section>
  )
}

function FlexChildSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  return (
    <Section title="Flex Child" defaultOpen={false}>
      <InlineRow label="Self" set={!!get('alignSelf')}>
        <select
          className={cn(inputCls, 'cursor-pointer')}
          value={get('alignSelf')}
          onChange={(e) => update({ alignSelf: e.target.value })}
        >
          {ALIGN_SELF_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: 'flexGrow', l: 'Grow' },
          { k: 'flexShrink', l: 'Shrink' },
          { k: 'order', l: 'Order' },
        ].map(({ k, l }) => (
          <StackField key={k} label={l} set={!!get(k)}>
            <CommitInput
              type="text"
              inputMode="numeric"
              className={inputCls}
              value={get(k)}
              placeholder="0"
              onCommit={(v) => update({ [k]: v })}
            />
          </StackField>
        ))}
      </div>
    </Section>
  )
}

function BordersSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  return (
    <Section title="Borders" defaultOpen={false}>
      <InlineRow label="Style" set={!!get('borderStyle')}>
        <SegmentedControl
          options={BORDER_STYLE_OPTIONS}
          value={get('borderStyle')}
          onChange={(v) => update({ borderStyle: v })}
        />
      </InlineRow>
      <InlineRow label="Width" set={!!get('borderWidth')}>
        <NumberUnitControl
          value={get('borderWidth')}
          onChange={(v) => update({ borderWidth: v })}
        />
      </InlineRow>
      <InlineRow label="Color" set={!!get('borderColor')}>
        <ColorControl value={get('borderColor')} onChange={(v) => update({ borderColor: v })} />
      </InlineRow>
      <StackField label="Radius (corners)" set={!!get('borderRadius')}>
        <BoxModelControl
          value={get('borderRadius')}
          onChange={(v) => update({ borderRadius: v })}
          labels={['TL', 'TR', 'BR', 'BL']}
        />
      </StackField>
      <StackField label="Box shadow" set={!!get('boxShadow')}>
        <BoxShadowControl value={get('boxShadow')} onChange={(v) => update({ boxShadow: v })} />
      </StackField>
    </Section>
  )
}

type CustomAttr = { name: string; value: string }

/**
 * Attributes panel (Webflow-style): the element's custom class, HTML id, and any
 * name/value attributes. `htmlId`/`attributes` flow through `Box`
 * (`customAttributes`), which filters them for safety; a valid `id` also makes
 * in-page anchors (`#features`) work.
 */
function AdvancedSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const className = typeof props.className === 'string' ? props.className : ''
  const htmlId = typeof props.htmlId === 'string' ? props.htmlId : ''
  const attrs: CustomAttr[] = Array.isArray(props.attributes)
    ? (props.attributes as CustomAttr[])
    : []
  const setAttrs = (next: CustomAttr[]) => update({ attributes: next.length ? next : undefined })

  return (
    <Section title="Attributes" defaultOpen={false}>
      <InlineRow label="Class" set={!!className}>
        <CommitInput
          type="text"
          className={inputCls}
          value={className}
          placeholder="custom-class"
          onCommit={(v) => update({ className: v })}
        />
      </InlineRow>
      <InlineRow label="ID" set={!!htmlId}>
        <CommitInput
          type="text"
          className={inputCls}
          value={htmlId}
          placeholder="element-id"
          onCommit={(v) => update({ htmlId: v })}
        />
      </InlineRow>
      <StackField label="Custom attributes" set={attrs.length > 0}>
        <div className="space-y-1.5">
          {attrs.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <CommitInput
                type="text"
                className={cn(inputCls, 'flex-1')}
                value={a.name}
                placeholder="name"
                onCommit={(v) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, name: v } : x)))}
              />
              <CommitInput
                type="text"
                className={cn(inputCls, 'flex-1')}
                value={a.value}
                placeholder="value"
                onCommit={(v) => setAttrs(attrs.map((x, j) => (j === i ? { ...x, value: v } : x)))}
              />
              <button
                type="button"
                aria-label="Remove attribute"
                onClick={() => setAttrs(attrs.filter((_, j) => j !== i))}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAttrs([...attrs, { name: '', value: '' }])}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add attribute
          </button>
        </div>
      </StackField>
    </Section>
  )
}

function LayoutSection({
  props,
  update,
  hasGap,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  hasGap: boolean
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  const display = get('display')
  const isFlexOrGrid = display === 'flex' || display === 'grid'
  return (
    <Section title="Layout">
      <InlineRow label="Display" set={!!display}>
        <SegmentedControl
          options={DISPLAY_OPTIONS}
          value={display}
          onChange={(v) => update({ display: v })}
        />
      </InlineRow>
      {isFlexOrGrid && (
        <>
          <InlineRow label="Direction" set={!!get('flexDirection')}>
            <SegmentedControl
              options={DIRECTION_OPTIONS}
              value={get('flexDirection')}
              onChange={(v) => update({ flexDirection: v })}
            />
          </InlineRow>
          <InlineRow label="Justify" set={!!get('justifyContent')}>
            <select
              className={cn(inputCls, 'cursor-pointer')}
              value={get('justifyContent')}
              onChange={(e) => update({ justifyContent: e.target.value })}
            >
              <option value="">Default</option>
              {JUSTIFY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </InlineRow>
          <InlineRow label="Align" set={!!get('alignItems')}>
            <select
              className={cn(inputCls, 'cursor-pointer')}
              value={get('alignItems')}
              onChange={(e) => update({ alignItems: e.target.value })}
            >
              <option value="">Default</option>
              {ALIGN_ITEMS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </InlineRow>
        </>
      )}
      {(isFlexOrGrid || hasGap) && (
        <InlineRow label="Gap" set={!!get('gap')}>
          <NumberUnitControl value={get('gap')} onChange={(v) => update({ gap: v })} />
        </InlineRow>
      )}
    </Section>
  )
}

function SizeSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  const overflow = get('overflow')
  return (
    <Section title="Size">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {SIZE_FIELDS.map((f) => {
          const v = get(f.key)
          return (
            <div key={f.key}>
              <span
                className={cn('mb-1 block text-xs', v ? 'text-blue-400' : 'text-muted-foreground')}
              >
                {f.label}
              </span>
              <NumberUnitControl value={v} onChange={(val) => update({ [f.key]: val })} />
            </div>
          )
        })}
      </div>
      <div className="flex min-h-7 items-center gap-2 pt-1">
        <span
          className={cn(
            'w-14 shrink-0 text-xs',
            overflow ? 'text-blue-400' : 'text-muted-foreground'
          )}
        >
          Overflow
        </span>
        <div className="min-w-0 flex-1">
          <SegmentedControl
            options={OVERFLOW_OPTIONS}
            value={overflow}
            onChange={(v) => update({ overflow: v })}
          />
        </div>
      </div>
    </Section>
  )
}

function PositionSection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  const position = get('position')
  const showOffsets = !!position && position !== 'static'
  return (
    <Section title="Position" defaultOpen={false}>
      <InlineRow label="Position" set={!!position}>
        <select
          className={cn(inputCls, 'cursor-pointer')}
          value={position}
          onChange={(e) => update({ position: e.target.value })}
        >
          {POSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>
      {showOffsets && (
        <>
          <OffsetControl
            top={get('top')}
            right={get('right')}
            bottom={get('bottom')}
            left={get('left')}
            onChange={(side, v) => update({ [side]: v })}
          />
          <InlineRow label="z-index" set={!!get('zIndex')}>
            <CommitInput
              type="text"
              inputMode="numeric"
              className={inputCls}
              value={get('zIndex')}
              placeholder="auto"
              onCommit={(v) => update({ zIndex: v })}
            />
          </InlineRow>
        </>
      )}
      <InlineRow label="Float" set={!!get('float')}>
        <SegmentedControl
          options={FLOAT_OPTIONS}
          value={get('float')}
          onChange={(v) => update({ float: v })}
        />
      </InlineRow>
      <InlineRow label="Clear" set={!!get('clear')}>
        <SegmentedControl
          options={CLEAR_OPTIONS}
          value={get('clear')}
          onChange={(v) => update({ clear: v })}
        />
      </InlineRow>
    </Section>
  )
}

function TypographySection({
  props,
  update,
}: {
  props: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}) {
  const get = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  const [more, setMore] = useState(false)
  return (
    <Section title="Typography">
      <InlineRow label="Font" set={!!get('font')}>
        <CommitInput
          type="text"
          value={get('font')}
          placeholder="Inherit"
          onCommit={(v) => update({ font: v })}
          className={inputCls}
        />
      </InlineRow>
      <InlineRow label="Weight" set={!!get('fontWeight')}>
        <select
          value={get('fontWeight')}
          onChange={(e) => update({ fontWeight: e.target.value })}
          className={cn(inputCls, 'cursor-pointer')}
        >
          <option value="">Inherit</option>
          {WEIGHT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </InlineRow>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <StackField label="Size" set={!!get('textSize')}>
          <NumberUnitControl value={get('textSize')} onChange={(v) => update({ textSize: v })} />
        </StackField>
        <StackField label="Height" set={!!get('lineHeight')}>
          <NumberUnitControl
            value={get('lineHeight')}
            onChange={(v) => update({ lineHeight: v })}
          />
        </StackField>
      </div>
      <InlineRow label="Color" set={!!get('textColor')}>
        <ColorControl value={get('textColor')} onChange={(v) => update({ textColor: v })} />
      </InlineRow>
      <InlineRow label="Align" set={!!get('align')}>
        <SegmentedControl
          options={ALIGN_OPTIONS}
          value={get('align')}
          onChange={(v) => update({ align: v })}
        />
      </InlineRow>
      <InlineRow label="Decor" set={!!get('textDecoration')}>
        <SegmentedControl
          options={DECOR_OPTIONS}
          value={get('textDecoration')}
          onChange={(v) => update({ textDecoration: v })}
        />
      </InlineRow>

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-input py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', !more && '-rotate-90')} />
        More type options
      </button>
      {more && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <StackField label="Letter sp" set={!!get('letterSpacing')}>
              <NumberUnitControl
                value={get('letterSpacing')}
                onChange={(v) => update({ letterSpacing: v })}
              />
            </StackField>
            <StackField label="Indent" set={!!get('textIndent')}>
              <NumberUnitControl
                value={get('textIndent')}
                onChange={(v) => update({ textIndent: v })}
              />
            </StackField>
          </div>
          <InlineRow label="Italic" set={!!get('fontStyle')}>
            <SegmentedControl
              options={FONTSTYLE_OPTIONS}
              value={get('fontStyle')}
              onChange={(v) => update({ fontStyle: v })}
            />
          </InlineRow>
          <InlineRow label="Case" set={!!get('textTransform')}>
            <SegmentedControl
              options={TRANSFORM_OPTIONS}
              value={get('textTransform')}
              onChange={(v) => update({ textTransform: v })}
            />
          </InlineRow>
          <InlineRow label="Dir" set={!!get('direction')}>
            <SegmentedControl
              options={TEXT_DIR_OPTIONS}
              value={get('direction')}
              onChange={(v) => update({ direction: v })}
            />
          </InlineRow>
          <InlineRow label="Wrap" set={!!get('whiteSpace')}>
            <select
              className={cn(inputCls, 'cursor-pointer')}
              value={get('whiteSpace')}
              onChange={(e) => update({ whiteSpace: e.target.value })}
            >
              {WRAP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </InlineRow>
        </div>
      )}
    </Section>
  )
}

function InlineRow({ label, set, children }: { label: string; set: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span
        className={cn(
          'w-14 shrink-0 text-xs leading-tight',
          set ? 'text-blue-400' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function StackField({
  label,
  set,
  children,
}: {
  label: string
  set: boolean
  children: ReactNode
}) {
  return (
    <div>
      <span className={cn('mb-1 block text-xs', set ? 'text-blue-400' : 'text-muted-foreground')}>
        {label}
      </span>
      {children}
    </div>
  )
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/30"
      >
        {title}
        <ChevronDown
          className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </button>
      {open && <div className="space-y-2 px-3 pb-3 pt-0.5">{children}</div>}
    </div>
  )
}

function FieldRow({
  field,
  name,
  itemId,
  label,
  value,
  onChange,
  inline = false,
}: {
  field: Field | undefined
  name: string
  itemId: string
  label: string
  value: unknown
  onChange: (value: unknown) => void
  inline?: boolean
}) {
  if (!field) return null
  const isSet = value !== undefined && value !== null && value !== ''
  const labelCls = cn('text-xs', isSet ? 'text-blue-400' : 'text-muted-foreground')

  if (inline) {
    return (
      <div className="flex min-h-7 items-center gap-2">
        <span className={cn('w-14 shrink-0 leading-tight', labelCls)}>{label}</span>
        <div className="min-w-0 flex-1">
          <FieldControl
            field={field}
            name={name}
            itemId={itemId}
            value={value}
            onChange={onChange}
          />
        </div>
      </div>
    )
  }

  return (
    <label className="block space-y-1">
      <span className={cn('block', labelCls)}>{label}</span>
      <FieldControl field={field} name={name} itemId={itemId} value={value} onChange={onChange} />
    </label>
  )
}

const inputCls =
  'h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring'

function FieldControl({
  field,
  name,
  itemId,
  value,
  onChange,
}: {
  field: Field
  name: string
  itemId: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (field.type === 'custom') {
    const render = field.render as (props: {
      value: unknown
      onChange: (value: unknown) => void
      name: string
      id: string
    }) => ReactNode
    return <>{render({ value, onChange, name, id: `${itemId}:${name}` })}</>
  }

  if (field.type === 'select') {
    return (
      <select
        className={cn(inputCls, 'cursor-pointer')}
        value={(value as string | undefined) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {(field.options ?? []).map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'radio') {
    const current = value === undefined || value === null ? '' : String(value)
    return (
      <div className="flex gap-1">
        {(field.options ?? []).map((o) => {
          const v = String(o.value)
          const active = current === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                'flex-1 rounded-md border px-2 py-1 text-xs transition-colors',
                active
                  ? 'border-blue-500 bg-blue-500/10 text-foreground'
                  : 'border-input text-muted-foreground hover:text-foreground'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (field.type === 'array') {
    return (
      <ArrayControl field={field} name={name} itemId={itemId} value={value} onChange={onChange} />
    )
  }

  if (field.type === 'object') {
    return (
      <ObjectControl field={field} name={name} itemId={itemId} value={value} onChange={onChange} />
    )
  }

  if (field.type === 'textarea') {
    return (
      <CommitTextarea
        rows={3}
        className={cn(inputCls, 'h-auto resize-y py-1.5')}
        value={(value as string | undefined) ?? ''}
        onCommit={(v) => onChange(v)}
      />
    )
  }

  if (field.type === 'number') {
    return (
      <CommitInput
        type="number"
        className={inputCls}
        value={value === undefined || value === null ? '' : String(value)}
        onCommit={(v) => onChange(v === '' ? undefined : Number(v))}
      />
    )
  }

  return (
    <CommitInput
      type="text"
      className={inputCls}
      value={(value as string | undefined) ?? ''}
      onCommit={(v) => onChange(v)}
    />
  )
}

/**
 * Editor for `type: 'object'` fields — a group of sub-fields stored under one
 * prop (e.g. the commerce Product List's `source`).
 *
 * Without this the field fell through to the plain text input below, which
 * rendered an object as an empty box and wrote a *string* back over it the
 * moment anything was typed — silently destroying the block's binding.
 */
function ObjectControl({
  field,
  name,
  itemId,
  value,
  onChange,
}: {
  field: Field
  name: string
  itemId: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const objectFields = (field as { objectFields?: Record<string, Field> }).objectFields ?? {}

  return (
    <div className="space-y-1.5 rounded-md border border-input p-2">
      {Object.entries(objectFields).map(([k, f]) => (
        <label key={k} className="block space-y-0.5">
          <span className="block text-[11px] text-muted-foreground">{f?.label ?? k}</span>
          <FieldControl
            field={f}
            name={`${name}.${k}`}
            itemId={itemId}
            value={obj[k]}
            onChange={(v) => onChange({ ...obj, [k]: v })}
          />
        </label>
      ))}
    </div>
  )
}

/** Editor for `type: 'array'` fields (Select options, Slider slides, Tabs tabs…). */
function ArrayControl({
  field,
  name,
  itemId,
  value,
  onChange,
}: {
  field: Field
  name: string
  itemId: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const arr = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
  const af = field as {
    arrayFields?: Record<string, Field>
    defaultItemProps?: Record<string, unknown>
  }
  const arrayFields = af.arrayFields ?? {}
  const defaultItem = af.defaultItemProps ?? {}

  const setItem = (i: number, key: string, v: unknown) =>
    onChange(arr.map((it, idx) => (idx === i ? { ...it, [key]: v } : it)))
  const add = () => onChange([...arr, { ...defaultItem }])
  const remove = (i: number) => onChange(arr.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {arr.map((item, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-input p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Item {i + 1}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Remove item"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
          {Object.entries(arrayFields).map(([k, f]) => (
            <label key={k} className="block space-y-0.5">
              <span className="block text-[11px] text-muted-foreground">{f?.label ?? k}</span>
              <FieldControl
                field={f}
                name={`${name}.${i}.${k}`}
                itemId={itemId}
                value={item[k]}
                onChange={(v) => setItem(i, k, v)}
              />
            </label>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" /> Add item
      </button>
    </div>
  )
}
