/**
 * Extract a colour palette from a design reference image so the AI can seed the
 * theme (set_appearance) from the design's real pixels instead of guessing blind.
 * Pure `sharp` (already a dependency) — downscale, read raw pixels, quantise into
 * colour buckets, then derive brand roles by luminance + saturation. Colours-only:
 * spacing/type scales are NOT reliably recoverable from a raster (the model still
 * sets those, steered by the design tokens from P1).
 */
import sharp from 'sharp'
import { safeColor } from '#services/settings_service'

export interface ReferencePalette {
  /** The most vivid, prominent colour — a CTA/brand candidate. */
  primary: string
  /** A second distinct colour (vivid or neutral) for secondary surfaces. */
  secondary: string
  /** The dominant light colour — a page-background candidate. */
  bg: string
  /** The dominant dark colour — a text/ink candidate. */
  ink: string
  /** The most prominent distinct colours, ordered by area, deduped (~6). */
  palette: string[]
}

interface Bucket {
  r: number
  g: number
  b: number
  count: number
  lum: number // 0..255 perceived luminance
  sat: number // 0..1 saturation
}

const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')

const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b

const saturation = (r: number, g: number, b: number): number => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

const dist = (a: Bucket, b: Bucket): number => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)

/** Extract a palette from a reference image file (absolute path). */
export async function extractPalette(path: string): Promise<ReferencePalette> {
  // Downscale hard (analysis, not display) and flatten transparency over white so a
  // transparent PNG doesn't skew the palette toward black.
  const { data, info } = await sharp(path)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(96, 96, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  const counts = new Map<number, number>()
  for (let i = 0; i + channels - 1 < data.length; i += channels) {
    // Quantise each channel to 4 bits (16 levels) so near-identical pixels merge.
    const r4 = data[i] >> 4
    const g4 = data[i + 1] >> 4
    const b4 = data[i + 2] >> 4
    const key = (r4 << 8) | (g4 << 4) | b4
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const buckets: Bucket[] = [...counts.entries()]
    .map(([key, count]) => {
      // Bucket centre: level*16 + 8.
      const r = ((key >> 8) & 0xf) * 16 + 8
      const g = ((key >> 4) & 0xf) * 16 + 8
      const b = (key & 0xf) * 16 + 8
      return { r, g, b, count, lum: luminance(r, g, b), sat: saturation(r, g, b) }
    })
    .sort((a, b) => b.count - a.count)

  if (!buckets.length) {
    // Blank/unreadable — return safe neutrals rather than throwing.
    return { primary: '#5225e6', secondary: '#111827', bg: '#ffffff', ink: '#111827', palette: ['#ffffff', '#111827'] }
  }

  // Prominent, visually-distinct colours by area (merge near-duplicates).
  const distinct: Bucket[] = []
  for (const c of buckets) {
    if (distinct.every((d) => dist(d, c) > 40)) distinct.push(c)
    if (distinct.length >= 6) break
  }

  const byVividness = [...buckets].filter((c) => c.sat > 0.25 && c.lum > 30 && c.lum < 225)
  byVividness.sort((a, b) => b.count * b.sat - a.count * a.sat)

  const bg = buckets.find((c) => c.lum > 200) ?? buckets[0]
  const ink = buckets.find((c) => c.lum < 60) ?? [...buckets].sort((a, b) => a.lum - b.lum)[0]
  const primary = byVividness[0] ?? distinct[0] ?? buckets[0]
  const secondary =
    byVividness.find((c) => dist(c, primary) > 60) ??
    distinct.find((c) => dist(c, primary) > 60 && dist(c, bg) > 60) ??
    ink

  const hex = (c: Bucket) => safeColor(toHex(c.r, c.g, c.b)) || '#000000'
  return {
    primary: hex(primary),
    secondary: hex(secondary),
    bg: hex(bg),
    ink: hex(ink),
    palette: distinct.map(hex),
  }
}
