/**
 * Guards for the `upload_media(url)` path — the same path that let a random
 * cat-statue photo become a self-hosted "brand" asset. Two concerns:
 *
 *  1. Placeholder/stock substitution — deny well-known placeholder hosts unless
 *     the caller explicitly asked for a labelled placeholder, so an AI can't
 *     silently paper over a missing brand asset with a stock photo.
 *  2. SSRF — the fetch runs inside the app process carrying no user secret, but
 *     it still shouldn't be usable to probe the internal network, so reject
 *     non-http(s) schemes and obvious private/loopback/link-local hosts.
 *
 * This is best-effort defence in depth (DNS-rebinding to a private IP is not
 * covered); the media route's own 25 MB limit + type sniff remain the backstop.
 *
 * NOTE: mirrored verbatim in `modules/mcp/server/src/client.ts` for the stdio
 * transport — keep the two in sync.
 */

/** Placeholder / stock-photo services we refuse for brand imagery. */
export const PLACEHOLDER_HOSTS = [
  'picsum.photos',
  'loremflickr.com',
  'placehold.co',
  'placeholder.com',
  'via.placeholder.com',
  'dummyimage.com',
  'placekitten.com',
  'placeimg.com',
  'source.unsplash.com',
  'baconmockup.com',
  'loripsum.net',
]

function isPlaceholderHost(host: string): boolean {
  return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith('.' + h))
}

/** Literal private / loopback / link-local hosts (defence in depth). */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal'))
    return true
  // IPv6 loopback / unique-local / link-local.
  if (h === '::1' || h === '[::1]' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))
    return true
  // IPv4 literal ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a >= 224) return true // multicast / reserved
  }
  return false
}

export type UrlPurpose = 'reference' | 'brand' | 'placeholder' | undefined

/**
 * Validate a caller-supplied image URL. Throws (with a message safe to surface,
 * echoing no upstream detail) when it must not be fetched. Returns the parsed
 * URL and whether it is a placeholder host (so origin can be recorded).
 */
export function assertFetchableImageUrl(
  raw: string,
  purpose: UrlPurpose
): { url: URL; isPlaceholder: boolean } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('That is not a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) image URLs can be uploaded.')
  }
  const host = url.hostname.toLowerCase()
  if (isPrivateHost(host)) {
    throw new Error('That host is not allowed.')
  }
  const placeholder = isPlaceholderHost(host)
  if (placeholder && purpose !== 'placeholder') {
    throw new Error(
      `${host} is a placeholder/stock image service — do not substitute it for hero, product or brand imagery. ` +
        `Upload the real asset (or the design reference, then crop_media it). ` +
        `Only if you deliberately need a labelled stand-in, pass purpose:"placeholder".`
    )
  }
  return { url, isPlaceholder: placeholder }
}

/** The origin to record for an uploaded URL, given its purpose. */
export function originForUrl(purpose: UrlPurpose, isPlaceholder: boolean): string {
  if (purpose === 'placeholder' || isPlaceholder) return 'placeholder'
  if (purpose === 'reference') return 'reference'
  return 'url'
}

/** The origin to record for a local-path upload. */
export function originForPath(purpose: UrlPurpose): string {
  return purpose === 'reference' ? 'reference' : 'upload'
}

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024
