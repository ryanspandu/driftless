import type { MediaVariantDto } from '~/types/api'

/**
 * The value an Image block stores for its source.
 *
 * Historically this was a bare URL string. It is now an object carrying the
 * responsive `srcset` (built at pick time from the media's webp derivatives)
 * plus intrinsic dimensions, so the published `<img>` can ship a right-sized
 * image per device and reserve layout space. A plain string still round-trips
 * (legacy pages, a pasted URL) — see `normalizeImageValue`.
 */
export interface ImageSource {
  url: string
  width?: number | null
  height?: number | null
  /** Precomputed `srcset` (e.g. "…-w480.webp 480w, …-w960.webp 960w"). */
  srcset?: string
}

/** Accept either the legacy string or the object shape; always return an object. */
export function normalizeImageValue(v: unknown): ImageSource {
  if (typeof v === 'string') return { url: v }
  if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') {
    return v as ImageSource
  }
  return { url: '' }
}

/** Build a `srcset` string from media variants (ascending width). */
export function buildSrcset(variants: MediaVariantDto[] | undefined): string {
  if (!variants || !variants.length) return ''
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ')
}
