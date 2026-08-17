import type { CSSProperties } from 'react'

/**
 * Background layers — the data shape, and the CSS it compiles to.
 *
 * Webflow models a background as a **stack of layers** (image, linear gradient,
 * radial gradient, solid overlay) painted over a base colour, topmost first.
 * CSS says the same thing: `background-image` takes a comma-separated list
 * painted front to back, with `-size`, `-position`, `-repeat` and `-attachment`
 * matched to it **positionally**. So the editor's list order is already the CSS
 * order and no translation is needed — but every layer must contribute an entry
 * to every list, or a gradient with no size of its own would silently consume
 * the image layer's `cover`.
 *
 * Layers live on the block's own props as `backgrounds`, like every other style
 * value here, so this is additive JSON with no migration. `bg` keeps its old
 * meaning as the base colour underneath the stack.
 *
 * Deliberately free of React and browser APIs: `style-fields.tsx` imports this
 * on the SSR render path.
 */

export type BgRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'
export type BgSizeMode = 'cover' | 'contain' | 'custom'
export type BgAttachment = 'scroll' | 'fixed'
export type BgLayerType = 'image' | 'linear' | 'radial' | 'overlay'

export interface BgStop {
  color: string
  /** Position along the gradient, e.g. `0%`. Blank lets the browser distribute it. */
  pos: string
}

interface BgLayerBase {
  id: string
  /** Toggled from the layer row's eye. Kept rather than deleted, like Webflow. */
  hidden?: boolean
}

export interface BgImageLayer extends BgLayerBase {
  type: 'image'
  url: string
  /** Media-library metadata, shown in the panel and used by `@2x`. */
  filename?: string
  naturalWidth?: number | null
  naturalHeight?: number | null
  fileSize?: number | null
  /** `@2x` — the asset is a retina export, so paint it at half its pixel size. */
  retina?: boolean
  sizeMode: BgSizeMode
  width?: string
  height?: string
  posX?: string
  posY?: string
  repeat: BgRepeat
  attachment: BgAttachment
}

export interface BgLinearLayer extends BgLayerBase {
  type: 'linear'
  /** Degrees, CSS convention (0 = to top, 180 = to bottom). */
  angle: string
  stops: BgStop[]
}

export interface BgRadialLayer extends BgLayerBase {
  type: 'radial'
  shape: 'circle' | 'ellipse'
  extent: string
  posX: string
  posY: string
  stops: BgStop[]
}

export interface BgOverlayLayer extends BgLayerBase {
  type: 'overlay'
  color: string
}

export type BgLayer = BgImageLayer | BgLinearLayer | BgRadialLayer | BgOverlayLayer

export const REPEAT_VALUES: BgRepeat[] = ['repeat', 'repeat-x', 'repeat-y', 'no-repeat']

/** Radial sizing keywords, in the order Webflow lists them. */
export const RADIAL_EXTENTS = [
  'closest-side',
  'closest-corner',
  'farthest-side',
  'farthest-corner',
] as const

let counter = 0
function layerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  counter += 1
  return `bg-${counter}`
}

/** The two-stop black→transparent ramp both gradient types start from. */
function defaultStops(): BgStop[] {
  return [
    { color: '#000000', pos: '0%' },
    { color: 'rgba(0,0,0,0)', pos: '100%' },
  ]
}

/**
 * A new layer, with Webflow's own defaults.
 *
 * An image starts at auto size, top-left, tiled and unfixed — not `cover` —
 * because that is what Webflow drops in, and matching it means a background
 * built there looks the same when rebuilt here.
 */
export function newLayer(type: BgLayerType): BgLayer {
  switch (type) {
    case 'image':
      return {
        id: layerId(),
        type: 'image',
        url: '',
        sizeMode: 'custom',
        width: '',
        height: '',
        posX: '0px',
        posY: '0px',
        repeat: 'repeat',
        attachment: 'scroll',
      }
    case 'linear':
      return { id: layerId(), type: 'linear', angle: '180', stops: defaultStops() }
    case 'radial':
      return {
        id: layerId(),
        type: 'radial',
        shape: 'circle',
        extent: 'farthest-corner',
        posX: '50%',
        posY: '50%',
        stops: defaultStops(),
      }
    case 'overlay':
    default:
      return { id: layerId(), type: 'overlay', color: 'rgba(0, 0, 0, 0.2)' }
  }
}

/**
 * Convert a layer to a different type, keeping what still applies.
 *
 * Switching linear→radial should not silently discard hand-tuned colour stops;
 * switching either to an image legitimately has nothing to carry over.
 */
export function convertLayer(layer: BgLayer, type: BgLayerType): BgLayer {
  if (layer.type === type) return layer
  const next = newLayer(type)
  next.id = layer.id
  next.hidden = layer.hidden
  const stops = 'stops' in layer ? layer.stops : null
  if (stops && 'stops' in next) next.stops = stops.map((s) => ({ ...s }))
  return next
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function readStops(v: unknown): BgStop[] {
  if (!Array.isArray(v)) return defaultStops()
  const stops = v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({ color: str(s.color), pos: str(s.pos) }))
    .filter((s) => s.color)
  return stops.length >= 2 ? stops : defaultStops()
}

/**
 * Parse the `backgrounds` prop defensively.
 *
 * Block props are hand-editable JSON that outlives any given version of this
 * editor, so an unrecognised or half-written layer is dropped rather than
 * allowed to throw inside the render path.
 */
export function readLayers(value: unknown): BgLayer[] {
  if (!Array.isArray(value)) return []
  const out: BgLayer[] = []

  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const l = raw as Record<string, unknown>
    const id = str(l.id) || layerId()
    const hidden = l.hidden === true

    switch (l.type) {
      case 'image':
        out.push({
          id,
          hidden,
          type: 'image',
          url: str(l.url),
          filename: str(l.filename) || undefined,
          naturalWidth: num(l.naturalWidth),
          naturalHeight: num(l.naturalHeight),
          fileSize: num(l.fileSize),
          retina: l.retina === true,
          sizeMode: l.sizeMode === 'cover' || l.sizeMode === 'contain' ? l.sizeMode : 'custom',
          width: str(l.width),
          height: str(l.height),
          posX: str(l.posX, '0px'),
          posY: str(l.posY, '0px'),
          repeat: REPEAT_VALUES.includes(l.repeat as BgRepeat) ? (l.repeat as BgRepeat) : 'repeat',
          attachment: l.attachment === 'fixed' ? 'fixed' : 'scroll',
        })
        break
      case 'linear':
        out.push({
          id,
          hidden,
          type: 'linear',
          angle: str(l.angle, '180'),
          stops: readStops(l.stops),
        })
        break
      case 'radial':
        out.push({
          id,
          hidden,
          type: 'radial',
          shape: l.shape === 'ellipse' ? 'ellipse' : 'circle',
          extent: str(l.extent, 'farthest-corner'),
          posX: str(l.posX, '50%'),
          posY: str(l.posY, '50%'),
          stops: readStops(l.stops),
        })
        break
      case 'overlay':
        out.push({ id, hidden, type: 'overlay', color: str(l.color, 'rgba(0, 0, 0, 0.2)') })
        break
      default:
        break
    }
  }

  return out
}

/** `url()` is not quote-safe on its own — a filename with a quote breaks the rule. */
function cssUrl(url: string): string {
  return `url("${url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

function stopList(stops: BgStop[]): string {
  return stops.map((s) => (s.pos ? `${s.color} ${s.pos}` : s.color)).join(', ')
}

/** The `background-image` entry for one layer, or `''` when it has nothing to paint. */
export function layerToImage(layer: BgLayer): string {
  switch (layer.type) {
    case 'image':
      return layer.url ? cssUrl(layer.url) : ''
    case 'linear':
      return layer.stops.length >= 2
        ? `linear-gradient(${layer.angle || '180'}deg, ${stopList(layer.stops)})`
        : ''
    case 'radial':
      return layer.stops.length >= 2
        ? `radial-gradient(${layer.shape} ${layer.extent} at ${layer.posX} ${layer.posY}, ${stopList(layer.stops)})`
        : ''
    /**
     * A flat colour has no gradient syntax of its own, so it is expressed as a
     * two-stop ramp of one colour. That is also how Webflow emits an overlay,
     * and it is what lets a solid sit *between* two other layers instead of
     * only ever underneath them as `background-color` would.
     */
    case 'overlay':
      return layer.color ? `linear-gradient(${layer.color}, ${layer.color})` : ''
    default:
      return ''
  }
}

function imageSize(layer: BgImageLayer): string {
  /**
   * `@2x` wins over the size mode, because that is the whole point of the flag:
   * the asset has twice the pixels it should occupy, and the only correct size
   * is half its intrinsic one. With no intrinsic size recorded there is nothing
   * to halve, so the flag is ignored rather than guessed at.
   */
  if (layer.retina && layer.naturalWidth) {
    const w = Math.round(layer.naturalWidth / 2)
    const h = layer.naturalHeight ? `${Math.round(layer.naturalHeight / 2)}px` : 'auto'
    return `${w}px ${h}`
  }
  if (layer.sizeMode === 'cover') return 'cover'
  if (layer.sizeMode === 'contain') return 'contain'
  return `${layer.width || 'auto'} ${layer.height || 'auto'}`
}

/**
 * Compile the visible layers into the five background longhands.
 *
 * Returns `null` when there is nothing to paint, which is the signal for
 * `styleToCss` to leave the old `background` shorthand alone — every page built
 * before this existed must keep rendering byte for byte.
 */
export function backgroundsToCss(layers: BgLayer[]): CSSProperties | null {
  const images: string[] = []
  const sizes: string[] = []
  const positions: string[] = []
  const repeats: string[] = []
  const attachments: string[] = []

  for (const layer of layers) {
    if (layer.hidden) continue
    const image = layerToImage(layer)
    if (!image) continue

    images.push(image)
    if (layer.type === 'image') {
      sizes.push(imageSize(layer))
      positions.push(`${layer.posX || '0px'} ${layer.posY || '0px'}`)
      repeats.push(layer.repeat)
      attachments.push(layer.attachment)
    } else {
      // Gradients still need their slot in each list, or the lists fall out of
      // step and an image layer inherits the wrong size.
      sizes.push('auto')
      positions.push('0% 0%')
      repeats.push('no-repeat')
      attachments.push('scroll')
    }
  }

  if (images.length === 0) return null

  return {
    backgroundImage: images.join(', '),
    backgroundSize: sizes.join(', '),
    backgroundPosition: positions.join(', '),
    backgroundRepeat: repeats.join(', '),
    backgroundAttachment: attachments.join(', '),
  }
}

/** Row label in the layer list. */
export function layerLabel(layer: BgLayer): string {
  switch (layer.type) {
    case 'image':
      if (layer.filename) return layer.filename
      if (!layer.url) return 'Image'
      return layer.url.split('?')[0]!.split('/').pop() || 'Image'
    case 'linear':
      return 'Linear gradient'
    case 'radial':
      return 'Radial gradient'
    case 'overlay':
      return layer.color || 'Overlay'
    default:
      return 'Layer'
  }
}

/** A `background` shorthand that previews one layer in its row swatch. */
export function layerSwatch(layer: BgLayer): string {
  if (layer.type === 'image') {
    return layer.url ? `${cssUrl(layer.url)} center / cover no-repeat` : 'transparent'
  }
  return layerToImage(layer) || 'transparent'
}

/** `3.4 kB`, matching the units the media library reports in. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
