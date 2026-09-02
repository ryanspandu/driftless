import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { cn } from '~/lib/utils'

/**
 * Webflow-style visual controls for the builder's Detail panel, wired into the
 * shared `styleFields` as Puck `custom` fields. They read/write the SAME plain
 * string props as before (e.g. `padding: "0 16px"`, `bg: "#fff"`, `align`), so
 * there's no data-shape change and existing pages keep working — only the editor
 * UI gets richer.
 */

/**
 * Every field in this panel is dense by default.
 *
 * The panel is ~290px wide and stacks a dozen sections; at `h-8`/`text-sm` the
 * unit dropdown alone could squeeze a number field to zero width, and the
 * vertical cost meant constant scrolling. One size, applied everywhere, rather
 * than an opt-in that has to be remembered at each call site.
 */
const inputCls =
  'h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring'

// ───────────────────── Debounced commit text fields ─────────────────────

/**
 * Keep each keystroke in LOCAL state and only call `onCommit` on a short
 * debounce, on blur, and on Enter — never per character.
 *
 * Every edit in this panel funnels through a Puck `replace` dispatch that
 * re-walks the whole document (O(n) in block count), so committing per keystroke
 * made a block-heavy page stutter. Committing per pause keeps typing instant
 * while collapsing a burst of keystrokes into one dispatch. Re-syncs from `value`
 * whenever the field is not the focused element (element switch, unit change,
 * undo/redo). Shared by {@link CommitInput} and {@link CommitTextarea}.
 */
function useCommit<E extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  onCommit: (next: string) => void,
  debounceMs: number
) {
  const [local, setLocal] = useState(value)
  const ref = useRef<E>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-sync local from `value` when it changes externally (element switch, unit
  // change, undo) — but never while the field is focused, so it can't clobber
  // what the user is typing.
  useEffect(() => {
    if (ref.current && document.activeElement === ref.current) return
    setLocal(value)
  }, [value])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const stopTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  const commit = (next: string) => {
    stopTimer()
    if (next !== value) onCommit(next)
  }
  const change = (next: string) => {
    setLocal(next)
    stopTimer()
    timer.current = setTimeout(() => commit(next), debounceMs)
  }
  const cancel = () => {
    stopTimer()
    setLocal(value)
    ref.current?.blur()
  }
  return { local, setLocal, ref, commit, change, cancel }
}

/**
 * Debounced single-line input. `stepOnArrows` restores Webflow's ↑/↓ numeric
 * nudging (see {@link stepNumericValue}), committing at once since a step is a
 * discrete action. Escape reverts.
 */
export function CommitInput({
  value,
  onCommit,
  debounceMs = 200,
  stepOnArrows = false,
  ...rest
}: {
  value: string
  onCommit: (next: string) => void
  debounceMs?: number
  stepOnArrows?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>) {
  const { local, setLocal, ref, commit, change, cancel } = useCommit<HTMLInputElement>(
    value,
    onCommit,
    debounceMs
  )
  return (
    <input
      {...rest}
      ref={ref}
      value={local}
      onChange={(e) => change(e.target.value)}
      onKeyDown={(e) => {
        if (stepOnArrows) {
          const stepped = stepNumericValue(local, e)
          if (stepped !== null) {
            e.preventDefault()
            setLocal(stepped)
            commit(stepped)
            return
          }
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(local)
        } else if (e.key === 'Escape') {
          cancel()
        }
      }}
      onBlur={() => commit(local)}
    />
  )
}

/** Debounced multi-line textarea (Enter inserts a newline; Escape reverts). */
export function CommitTextarea({
  value,
  onCommit,
  debounceMs = 200,
  ...rest
}: {
  value: string
  onCommit: (next: string) => void
  debounceMs?: number
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'>) {
  const { local, ref, commit, change, cancel } = useCommit<HTMLTextAreaElement>(
    value,
    onCommit,
    debounceMs
  )
  return (
    <textarea
      {...rest}
      ref={ref}
      value={local}
      onChange={(e) => change(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel()
      }}
      onBlur={() => commit(local)}
    />
  )
}

// ─────────────────────── Keyboard stepping (arrow keys) ───────────────────────

/**
 * Nudge a numeric field with the arrow keys.
 *
 * These are `type="text"` inputs — they accept `16px` and `50%`, which a
 * `type="number"` cannot hold — and that quietly costs the arrow-key stepping
 * a number field gets for free. Restored here with Webflow's own increments, so
 * muscle memory carries over: **↑/↓ = 1**, **Shift = 10**, **Alt = 0.1**.
 *
 * Returns null when there is nothing to step — a non-arrow key, or a value with
 * no number in it (`auto`, `calc(…)`) — which is the signal to leave the event
 * alone rather than swallow it.
 */
export function stepNumericValue(
  value: string,
  event: { key: string; shiftKey: boolean; altKey: boolean }
): string | null {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return null

  const raw = (value ?? '').trim()
  const { num, unit } = parseNumUnit(raw)
  if (unit === 'auto' || unit === 'none') return null

  const current = Number.parseFloat(num || '0')
  if (Number.isNaN(current)) return null

  const step = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
  const next = current + (event.key === 'ArrowUp' ? step : -step)
  // 0.1 steps otherwise produce 0.30000000000000004; two decimals is already
  // finer than any length in this panel needs.
  const rounded = String(Math.round(next * 100) / 100)

  // A value typed without a unit stays without one; an empty field picks up the
  // control's default rather than becoming a bare number CSS would ignore.
  return /^-?[\d.]+$/.test(raw) ? rounded : composeNumUnit(rounded, unit)
}

// ───────────────────────── Text align (segmented) ─────────────────────────

const ALIGN_OPTIONS = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
] as const

export function AlignControl({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      {ALIGN_OPTIONS.map(({ value: v, icon: Icon }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            aria-label={v}
            onClick={() => onChange(active ? '' : v)}
            className={cn(
              'flex h-6 flex-1 items-center justify-center rounded transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────── Segmented control (generic) ─────────────────────

export type SegmentedOption = {
  value: string
  label?: string
  icon?: ComponentType<{ className?: string }>
  title?: string
}

/** Webflow-style segmented buttons. Clicking the active option clears it. */
export function SegmentedControl({
  options,
  value,
  onChange,
  allowClear = true,
}: {
  options: SegmentedOption[]
  value?: string
  onChange: (value: string) => void
  allowClear?: boolean
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      {options.map((o) => {
        const active = value === o.value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            title={o.title ?? o.label ?? o.value}
            aria-pressed={active}
            onClick={() => onChange(active && allowClear ? '' : o.value)}
            className={cn(
              'flex h-6 flex-1 items-center justify-center gap-1 rounded px-1 text-[11px] font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {o.label ? <span>{o.label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────────── Colour (swatch) ─────────────────────────────

function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
}

/**
 * Theme swatches. These insert a CSS variable reference, not a fixed hex — so a
 * block coloured "Primary" follows whatever the operator sets in Website
 * Settings → Appearance (and the light/dark scope) instead of freezing a value.
 * Plain hex/keywords stay available in the text field + native picker.
 */
const THEME_SWATCHES: { label: string; value: string }[] = [
  { label: 'Primary', value: 'var(--primary)' },
  { label: 'Secondary', value: 'var(--secondary)' },
  { label: 'Accent', value: 'var(--accent)' },
  { label: 'Text', value: 'var(--foreground)' },
  { label: 'Muted', value: 'var(--muted-foreground)' },
  { label: 'Surface', value: 'var(--background)' },
  { label: 'Border', value: 'var(--border)' },
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'None', value: 'transparent' },
]

export function ColorControl({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const v = value ?? ''
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label
          className="size-7 shrink-0 cursor-pointer rounded-md border border-input"
          style={{ background: v || 'transparent' }}
          title="Pick a colour"
        >
          <input
            type="color"
            value={isHex(v) ? v : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="size-0 opacity-0"
            aria-label="Pick colour"
          />
        </label>
        <CommitInput
          type="text"
          value={v}
          placeholder="—"
          onCommit={onChange}
          className={cn(inputCls, 'tabular-nums')}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {THEME_SWATCHES.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.label}
            onClick={() => onChange(s.value)}
            className={cn(
              'size-5 rounded border transition-transform hover:scale-110',
              v === s.value ? 'border-ring ring-1 ring-ring' : 'border-input',
              s.value === 'transparent' &&
                'bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%)] bg-[length:8px_8px] bg-[position:0_0,4px_4px]'
            )}
            style={s.value === 'transparent' ? undefined : { background: s.value }}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────── Box model (padding / margin) ───────────────────────

type Sides = [string, string, string, string] // top, right, bottom, left

function parseBox(v: string | undefined): Sides {
  const p = (v ?? '').trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return ['', '', '', '']
  if (p.length === 1) return [p[0], p[0], p[0], p[0]]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  if (p.length === 3) return [p[0], p[1], p[2], p[1]]
  return [p[0], p[1], p[2], p[3]]
}

function composeBox(sides: Sides): string {
  const [t, r, b, l] = sides.map((s) => s.trim()) as Sides
  if (!t && !r && !b && !l) return ''
  const f = (x: string) => x || '0'
  const [tt, rr, bb, ll] = [f(t), f(r), f(b), f(l)]
  if (tt === rr && rr === bb && bb === ll) return tt
  if (tt === bb && rr === ll) return `${tt} ${rr}`
  return `${tt} ${rr} ${bb} ${ll}`
}

const SIDE_LABELS = ['T', 'R', 'B', 'L'] as const

export function BoxModelControl({
  value,
  onChange,
  labels = SIDE_LABELS,
}: {
  value?: string
  onChange: (value: string) => void
  labels?: readonly string[]
}) {
  const sides = parseBox(value)
  const setSide = (i: number, next: string) => {
    const copy = [...sides] as Sides
    copy[i] = next
    onChange(composeBox(copy))
  }
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {labels.map((label, i) => (
        <label key={label} className="flex flex-col gap-1">
          <span className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <CommitInput
            type="text"
            value={sides[i]}
            placeholder="0"
            stepOnArrows
            onCommit={(next) => setSide(i, next)}
            className="h-7 w-full rounded-md border border-input bg-background px-1 text-center text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      ))}
    </div>
  )
}

// ───────────────────── Number + unit (Webflow-style) ─────────────────────

const DEFAULT_UNITS = ['px', '%', 'rem', 'em', 'vw', 'vh', 'auto']

function parseNumUnit(v: string): { num: string; unit: string } {
  const s = (v ?? '').trim()
  if (!s) return { num: '', unit: 'px' }
  if (s === 'auto') return { num: '', unit: 'auto' }
  if (s === 'none') return { num: '', unit: 'none' }
  const m = s.match(/^(-?[\d.]+)\s*([a-z%]*)$/i)
  if (m) return { num: m[1], unit: m[2] || 'px' }
  return { num: s, unit: 'px' } // complex value (e.g. calc()) — keep it editable
}

function composeNumUnit(num: string, unit: string): string {
  if (unit === 'auto') return 'auto'
  if (unit === 'none') return 'none'
  const n = num.trim()
  return n ? `${n}${unit}` : ''
}

export function NumberUnitControl({
  value,
  onChange,
  units = DEFAULT_UNITS,
}: {
  value?: string
  onChange: (value: string) => void
  units?: string[]
}) {
  const { num, unit } = parseNumUnit(value ?? '')
  const unitless = unit === 'auto' || unit === 'none'
  const unitOptions = units.includes(unit) ? units : [unit, ...units]
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      <CommitInput
        type="text"
        inputMode="decimal"
        value={unitless ? '' : num}
        placeholder={unitless ? unit : '0'}
        disabled={unitless}
        stepOnArrows
        onCommit={(next) => onChange(composeNumUnit(parseNumUnit(next).num, unit))}
        className="h-7 w-full min-w-0 bg-transparent px-1.5 text-xs tabular-nums outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      {/*
        The one native select element left in the builder, on purpose (allow-listed in
        tests/unit/builder_ui_conventions.spec.ts). `appearance-none` drops the
        native dropdown arrow — roughly 18px of chrome the number field pays for
        out of the same line, and enough on its own to collapse the input to
        nothing in the narrower columns. The unit text is the affordance, and a
        bordered dropdown control would not fit this slot.
      */}
      <select
        value={unit}
        onChange={(e) => onChange(composeNumUnit(num, e.target.value))}
        className="h-7 cursor-pointer appearance-none border-l border-input bg-transparent px-1 text-center text-[10px] uppercase text-muted-foreground outline-none hover:text-foreground"
        aria-label="Unit"
      >
        {unitOptions.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  )
}

// ───────────────────────── Box shadow (visual) ─────────────────────────

const SHADOW_PARTS: { key: 'x' | 'y' | 'blur' | 'spread'; label: string }[] = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'blur', label: 'Blur' },
  { key: 'spread', label: 'Spread' },
]

type Shadow = { x: string; y: string; blur: string; spread: string; color: string }

function parseShadow(v: string): Shadow {
  const s = (v ?? '').trim()
  if (!s || /^(sm|md|lg|none)$/i.test(s)) return { x: '', y: '', blur: '', spread: '', color: '' }
  const tokens = s.split(/\s+/)
  const nums: string[] = []
  let i = 0
  while (i < tokens.length && nums.length < 4 && /^-?[\d.]+(px|em|rem|%)?$/i.test(tokens[i])) {
    nums.push(tokens[i])
    i++
  }
  return {
    x: nums[0] ?? '',
    y: nums[1] ?? '',
    blur: nums[2] ?? '',
    spread: nums[3] ?? '',
    color: tokens.slice(i).join(' '),
  }
}

function composeShadow(sh: Shadow): string {
  if (!sh.x && !sh.y && !sh.blur && !sh.spread && !sh.color) return ''
  const f = (v: string) => v || '0'
  return `${f(sh.x)} ${f(sh.y)} ${f(sh.blur)} ${f(sh.spread)} ${sh.color || 'rgba(0,0,0,0.2)'}`
}

export function BoxShadowControl({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const sh = parseShadow(value ?? '')
  const set = (patch: Partial<Shadow>) => onChange(composeShadow({ ...sh, ...patch }))
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {SHADOW_PARTS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            <CommitInput
              type="text"
              value={sh[key]}
              placeholder="0"
              stepOnArrows
              onCommit={(next) => set({ [key]: next } as Partial<Shadow>)}
              className="h-7 w-full rounded-md border border-input bg-background px-1 text-center text-xs tabular-nums outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        ))}
      </div>
      <ColorControl value={sh.color} onChange={(c) => set({ color: c })} />
    </div>
  )
}

// ─────────── Spacing diagram (Webflow-style nested margin/padding) ───────────

/** A single editable side value, absolutely positioned on the box edges. */
function SideBox({
  className,
  value,
  onChange,
  placeholder = '0',
}: {
  className: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <CommitInput
      type="text"
      value={value}
      placeholder={placeholder}
      stepOnArrows
      onCommit={onChange}
      className={cn(
        'absolute w-9 rounded bg-transparent py-0.5 text-center text-xs tabular-nums text-foreground outline-none hover:bg-muted focus:bg-muted focus:ring-1 focus:ring-ring',
        className
      )}
    />
  )
}

/** Webflow-style position offset box (top / right / bottom / left "inset"). */
export function OffsetControl({
  top,
  right,
  bottom,
  left,
  onChange,
}: {
  top?: string
  right?: string
  bottom?: string
  left?: string
  onChange: (side: 'top' | 'right' | 'bottom' | 'left', value: string) => void
}) {
  return (
    <div className="relative rounded-md border border-border/60 bg-muted/30 px-11 pb-9 pt-9">
      <span className="absolute left-2.5 top-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Inset
      </span>
      <SideBox
        className="left-1/2 top-1 -translate-x-1/2"
        value={top ?? ''}
        placeholder="auto"
        onChange={(v) => onChange('top', v)}
      />
      <SideBox
        className="right-1.5 top-1/2 -translate-y-1/2"
        value={right ?? ''}
        placeholder="auto"
        onChange={(v) => onChange('right', v)}
      />
      <SideBox
        className="bottom-1 left-1/2 -translate-x-1/2"
        value={bottom ?? ''}
        placeholder="auto"
        onChange={(v) => onChange('bottom', v)}
      />
      <SideBox
        className="left-1.5 top-1/2 -translate-y-1/2"
        value={left ?? ''}
        placeholder="auto"
        onChange={(v) => onChange('left', v)}
      />
      <div className="mx-auto h-7 w-14 rounded bg-muted/40" />
    </div>
  )
}

/**
 * Webflow's signature Spacing control: an outer MARGIN frame wrapping an inner
 * PADDING frame, each with four editable side values (top/right/bottom/left).
 * Reads/writes the two CSS shorthand props (`margin`, `padding`) at once.
 */
export function SpacingControl({
  margin,
  padding,
  onChange,
}: {
  margin?: string
  padding?: string
  onChange: (margin: string, padding: string) => void
}) {
  const m = parseBox(margin)
  const p = parseBox(padding)
  const setM = (i: number, val: string) => {
    const c = [...m] as Sides
    c[i] = val
    onChange(composeBox(c), composeBox(p))
  }
  const setP = (i: number, val: string) => {
    const c = [...p] as Sides
    c[i] = val
    onChange(composeBox(m), composeBox(c))
  }
  return (
    <div className="relative rounded-lg border border-border/60 bg-muted/30 px-11 pb-9 pt-10">
      <span className="absolute left-2.5 top-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Margin
      </span>
      <SideBox
        className="left-1/2 top-1 -translate-x-1/2"
        value={m[0]}
        onChange={(v) => setM(0, v)}
      />
      <SideBox
        className="right-1.5 top-1/2 -translate-y-1/2"
        value={m[1]}
        onChange={(v) => setM(1, v)}
      />
      <SideBox
        className="bottom-1 left-1/2 -translate-x-1/2"
        value={m[2]}
        onChange={(v) => setM(2, v)}
      />
      <SideBox
        className="left-1.5 top-1/2 -translate-y-1/2"
        value={m[3]}
        onChange={(v) => setM(3, v)}
      />

      <div className="relative rounded-md border border-border/60 bg-background px-10 pb-8 pt-9">
        <span className="absolute left-2.5 top-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          Padding
        </span>
        <SideBox
          className="left-1/2 top-1 -translate-x-1/2"
          value={p[0]}
          onChange={(v) => setP(0, v)}
        />
        <SideBox
          className="right-1.5 top-1/2 -translate-y-1/2"
          value={p[1]}
          onChange={(v) => setP(1, v)}
        />
        <SideBox
          className="bottom-1 left-1/2 -translate-x-1/2"
          value={p[2]}
          onChange={(v) => setP(2, v)}
        />
        <SideBox
          className="left-1.5 top-1/2 -translate-y-1/2"
          value={p[3]}
          onChange={(v) => setP(3, v)}
        />
        <div className="mx-auto h-5 w-12 rounded bg-muted/50" />
      </div>
    </div>
  )
}
