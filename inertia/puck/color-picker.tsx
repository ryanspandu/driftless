import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { cn } from '~/lib/utils'

/**
 * A self-contained HSV(A) colour picker — the in-app replacement for the native
 * `<input type="color">` well, which the browser renders as an OS dialog we can
 * neither theme nor keep on-brand. Saturation/value square + hue slider + alpha
 * slider, all painted with inline `style` gradients (allowed under the strict
 * prod CSP via `style-src-attr 'unsafe-inline'`, so no `<style>` and no nonce).
 *
 * It speaks plain CSS colour strings: it PARSES the incoming `value` (hex,
 * rgb/rgba, `transparent`, or — resolved through a probe element — a named colour
 * or `var(--token)`), and EMITS `#rrggbb` when opaque or `rgba(…)` when
 * translucent. Theme-variable values (`var(--primary)`) stay the job of the
 * swatch row in `ColorControl`; picking here writes a concrete colour, as an
 * operator dragging the square would expect.
 */

export type Rgba = { r: number; g: number; b: number; a: number }
export type Hsva = { h: number; s: number; v: number; a: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Parse a hex / rgb() / rgba() / `transparent` string to RGBA, else null. */
export function parseToRgba(input: string): Rgba | null {
  const v = input.trim().toLowerCase()
  if (!v) return null
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const hex = v.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    const h = hex[1]!
    if (h.length === 3 || h.length === 4) {
      const p = h.split('').map((c) => Number.parseInt(c + c, 16))
      return { r: p[0]!, g: p[1]!, b: p[2]!, a: h.length === 4 ? p[3]! / 255 : 1 }
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: Number.parseInt(h.slice(0, 2), 16),
        g: Number.parseInt(h.slice(2, 4), 16),
        b: Number.parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  const rgb = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/)
  if (rgb) {
    const rawA = rgb[4]
    const a =
      rawA === undefined
        ? 1
        : rawA.endsWith('%')
          ? Number.parseFloat(rawA) / 100
          : Number.parseFloat(rawA)
    return {
      r: clamp(Number(rgb[1]), 0, 255),
      g: clamp(Number(rgb[2]), 0, 255),
      b: clamp(Number(rgb[3]), 0, 255),
      a: clamp(a, 0, 1),
    }
  }
  return null
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a }
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const hh = (((h % 360) + 360) % 360) / 60
  const c = v * s
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 1) [r, g, b] = [c, x, 0]
  else if (hh < 2) [r, g, b] = [x, c, 0]
  else if (hh < 3) [r, g, b] = [0, c, x]
  else if (hh < 4) [r, g, b] = [0, x, c]
  else if (hh < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  }
}

const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')

/** RGBA → the string we store: `#rrggbb` when opaque, else `rgba(…)`. */
export function rgbaToCss({ r, g, b, a }: Rgba): string {
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(2))})`
}

/**
 * A 1- or 2-axis pointer drag over an element, reporting normalised [0,1]
 * position. The track element is read straight off `e.currentTarget` (no ref),
 * and pointer capture keeps the interaction alive when the cursor leaves the
 * track — so a drag off the edge still clamps instead of dropping.
 */
function useTrackDrag(onMove: (x: number, y: number) => void) {
  const report = useCallback(
    (el: HTMLElement, clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      onMove(
        rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0,
        rect.height ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0
      )
    },
    [onMove]
  )
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      report(e.currentTarget, e.clientX, e.clientY)
    },
    [report]
  )
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.buttons !== 1) return
      report(e.currentTarget, e.clientX, e.clientY)
    },
    [report]
  )
  return { onPointerDown, onPointerMove }
}

const THUMB =
  'pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/40'
const CHECKERBOARD =
  'bg-[length:8px_8px] bg-[position:0_0,4px_4px] bg-[linear-gradient(45deg,#bbb_25%,transparent_25%,transparent_75%,#bbb_75%),linear-gradient(45deg,#bbb_25%,transparent_25%,transparent_75%,#bbb_75%)]'

export function ColorPicker({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const [hsva, setHsva] = useState<Hsva>(() => {
    const rgba = parseToRgba(value ?? '')
    return rgba ? rgbToHsv(rgba) : { h: 0, s: 0, v: 0, a: 1 }
  })
  // The exact string we last emitted — used to ignore the echo that comes back
  // as a new `value` prop, so a live edit doesn't quantise the thumbs mid-drag.
  const lastEmit = useRef<string | null>(null)
  const probeRef = useRef<HTMLSpanElement>(null)

  // Sync from an external value change (theme swatch, the text field, or the
  // initial `var(--token)` / named colour resolved through the probe element).
  useEffect(() => {
    if (value === lastEmit.current) return
    let rgba = parseToRgba(value ?? '')
    if (!rgba && value && probeRef.current) {
      probeRef.current.style.color = ''
      probeRef.current.style.color = value
      rgba = parseToRgba(getComputedStyle(probeRef.current).color)
    }
    if (!rgba) return
    const next = rgbToHsv(rgba)
    // Hue is undefined for greys — keep the wheel where the operator left it.
    setHsva((prev) => ({ ...next, h: next.s === 0 ? prev.h : next.h }))
  }, [value])

  // Each drag sets its axis to an ABSOLUTE value from the pointer and leaves the
  // others untouched, so closing over `hsva` (fresh each render) is correct — the
  // non-dragged axes never move during a single-track drag, no latest-value ref
  // needed.
  const emit = useCallback(
    (partial: Partial<Hsva>) => {
      const next = { ...hsva, ...partial }
      setHsva(next)
      const css = rgbaToCss(hsvToRgb(next))
      lastEmit.current = css
      onChange(css)
    },
    [hsva, onChange]
  )

  const sv = useTrackDrag((x, y) => emit({ s: x, v: 1 - y }))
  const hue = useTrackDrag((x) => emit({ h: x * 360 }))
  const alpha = useTrackDrag((x) => emit({ a: x }))

  const rgb = hsvToRgb(hsva)
  const hueColor = rgbaToCss(hsvToRgb({ h: hsva.h, s: 1, v: 1, a: 1 }))
  const solid = rgbaToCss({ ...rgb, a: 1 })
  const current = rgbaToCss(rgb)

  return (
    <div className="w-full select-none space-y-2.5">
      <span ref={probeRef} aria-hidden className="sr-only" />

      {/* Saturation (x) × value (y). */}
      <div
        onPointerDown={sv.onPointerDown}
        onPointerMove={sv.onPointerMove}
        className="relative h-32 w-full cursor-crosshair rounded-md border border-input"
        style={{
          backgroundColor: hueColor,
          backgroundImage:
            'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
        }}
      >
        <span
          className={THUMB}
          style={{
            left: `${hsva.s * 100}%`,
            top: `${(1 - hsva.v) * 100}%`,
            backgroundColor: solid,
          }}
        />
      </div>

      {/* Hue. */}
      <div
        onPointerDown={hue.onPointerDown}
        onPointerMove={hue.onPointerMove}
        className="relative h-3 w-full cursor-pointer rounded-full"
        style={{
          backgroundImage: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
      >
        <span
          className={cn(THUMB, 'top-1/2')}
          style={{ left: `${(hsva.h / 360) * 100}%`, backgroundColor: hueColor }}
        />
      </div>

      {/* Alpha. */}
      <div
        onPointerDown={alpha.onPointerDown}
        onPointerMove={alpha.onPointerMove}
        className={cn('relative h-3 w-full cursor-pointer rounded-full', CHECKERBOARD)}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ backgroundImage: `linear-gradient(to right, transparent, ${solid})` }}
        />
        <span
          className={cn(THUMB, 'top-1/2')}
          style={{ left: `${hsva.a * 100}%`, backgroundColor: current }}
        />
      </div>
    </div>
  )
}
