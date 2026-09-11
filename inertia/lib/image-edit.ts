/**
 * Client-side image editing helpers backing the Media editor dialog. Crop +
 * rotate (90° steps) + resize are applied on a canvas and exported to a Blob,
 * which is uploaded to replace the original file in place.
 */

/** Crop rectangle in percentages (0–100), matching react-image-crop's PercentCrop. */
export type PercentRect = { x: number; y: number; width: number; height: number }

/** Only raster formats the canvas can re-encode are editable. */
export function isEditableImage(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp'
}

/** Output dimensions of a crop + rotation, in natural pixels. */
export function outputDimensions(
  natural: { width: number; height: number },
  cropPct: PercentRect | null,
  rotate: number
): { width: number; height: number } {
  const c = cropPct ?? { x: 0, y: 0, width: 100, height: 100 }
  const w = Math.round((c.width / 100) * natural.width)
  const h = Math.round((c.height / 100) * natural.height)
  const rot = ((rotate % 360) + 360) % 360
  const swapped = rot === 90 || rot === 270
  return { width: Math.max(1, swapped ? h : w), height: Math.max(1, swapped ? w : h) }
}

/** Draw the cropped + rotated region of `image` onto a fresh canvas. */
function drawCropped(
  image: HTMLImageElement,
  cropPct: PercentRect | null,
  rotate: number
): HTMLCanvasElement {
  const nw = image.naturalWidth
  const nh = image.naturalHeight
  const c = cropPct ?? { x: 0, y: 0, width: 100, height: 100 }
  const sx = (c.x / 100) * nw
  const sy = (c.y / 100) * nh
  const sw = (c.width / 100) * nw
  const sh = (c.height / 100) * nh

  const rot = ((rotate % 360) + 360) % 360
  const swapped = rot === 90 || rot === 270

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(swapped ? sh : sw))
  canvas.height = Math.max(1, Math.round(swapped ? sw : sh))

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
  return canvas
}

/** Scale a canvas to target dimensions (returns the same canvas if unchanged). */
function scaleCanvas(src: HTMLCanvasElement, tw: number, th: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(tw))
  const h = Math.max(1, Math.round(th))
  if (src.width === w && src.height === h) return src
  const dst = document.createElement('canvas')
  dst.width = w
  dst.height = h
  const ctx = dst.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return dst
}

/**
 * Produce the edited image. Crop + rotate first, then optionally resize to
 * `targetWidth`/`targetHeight`. Re-encodes as the original mime when it is a
 * canvas-supported raster type, otherwise JPEG.
 */
export async function renderEditedBlob(opts: {
  image: HTMLImageElement
  cropPct: PercentRect | null
  rotate: number
  targetWidth?: number | null
  targetHeight?: number | null
  mimeType: string
}): Promise<{ blob: Blob; width: number; height: number }> {
  const cropped = drawCropped(opts.image, opts.cropPct, opts.rotate)
  const tw = opts.targetWidth && opts.targetWidth > 0 ? opts.targetWidth : cropped.width
  const th = opts.targetHeight && opts.targetHeight > 0 ? opts.targetHeight : cropped.height
  const final = scaleCanvas(cropped, tw, th)

  const type = isEditableImage(opts.mimeType) ? opts.mimeType : 'image/jpeg'
  const quality = type === 'image/png' ? undefined : 0.92
  const blob = await new Promise<Blob | null>((resolve) => final.toBlob(resolve, type, quality))
  if (!blob) throw new Error('Failed to render edited image')
  return { blob, width: final.width, height: final.height }
}
