/**
 * Thin HTTP client for the Driftless builder-API.
 *
 * Every MCP tool is a call through here. Configuration comes from the
 * environment so the same binary points at local dev today and a remote,
 * hosted Driftless tomorrow — only the URL changes:
 *
 *   DRIFTLESS_URL    base origin (default http://localhost:3333)
 *   DRIFTLESS_TOKEN  a personal access token with the needed `builder:*` scopes
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const BASE = (process.env.DRIFTLESS_URL || 'http://localhost:3333').replace(/\/+$/, '')
const TOKEN = process.env.DRIFTLESS_TOKEN || ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function authHeader(): Record<string, string> {
  if (!TOKEN)
    throw new Error(
      'DRIFTLESS_TOKEN is not set — mint a personal access token in Admin → Settings → API tokens.'
    )
  return { Authorization: `Bearer ${TOKEN}` }
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>
  body?: unknown
}

function url(path: string, query?: RequestOptions['query']): string {
  const u = new URL(BASE + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v))
    }
  }
  return u.toString()
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    return String((body as { message: unknown }).message)
  }
  return fallback
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(
  method: string,
  path: string,
  options: RequestOptions = {}
): Promise<unknown> {
  const headers: Record<string, string> = { ...authHeader() }
  let payload: BodyInit | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(options.body)
  }
  const res = await fetch(url(path, options.query), { method, headers, body: payload })
  const body = await parse(res)
  if (!res.ok) {
    throw new ApiError(
      res.status,
      messageFrom(body, `${method} ${path} failed with ${res.status}`),
      body
    )
  }
  return body
}

export const api = {
  get: (path: string, query?: RequestOptions['query']) => request('GET', path, { query }),
  post: (path: string, body?: unknown) => request('POST', path, { body }),
  put: (path: string, body?: unknown) => request('PUT', path, { body }),
  patch: (path: string, body?: unknown) => request('PATCH', path, { body }),
  del: (path: string) => request('DELETE', path),
}

// Placeholder / stock hosts and private-network guard for the URL fetch path.
// MIRRORS `modules/mcp/services/image_url_guard.ts` — keep the two in sync.
const PLACEHOLDER_HOSTS = [
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
const MAX_MEDIA_BYTES = 25 * 1024 * 1024

function isPlaceholderHost(host: string): boolean {
  return PLACEHOLDER_HOSTS.some((h) => host === h || host.endsWith('.' + h))
}
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal'))
    return true
  if (h === '::1' || h === '[::1]' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'))
    return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a >= 224) return true
  }
  return false
}

export interface UploadSource {
  path?: string
  url?: string
  purpose?: 'reference' | 'brand' | 'placeholder'
  alt?: string
  title?: string
}

/**
 * Upload media. The server only accepts multipart, so a source URL is fetched
 * here and posted as bytes — keeping the server's single audited ingest path.
 * A URL is checked against the placeholder deny-list (unless purpose is
 * 'placeholder') and private-network ranges before it is fetched, and the
 * provenance (origin + sourceUrl) is stamped on the row.
 */
export async function uploadMedia(source: UploadSource): Promise<unknown> {
  let bytes: Uint8Array
  let name: string
  let origin: string
  let sourceUrl: string | null = null
  if (source.path) {
    bytes = await readFile(source.path)
    name = basename(source.path)
    origin = source.purpose === 'reference' ? 'reference' : 'upload'
  } else if (source.url) {
    let parsed: URL
    try {
      parsed = new URL(source.url)
    } catch {
      throw new Error('That is not a valid URL.')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      throw new Error('Only http(s) image URLs can be uploaded.')
    const host = parsed.hostname.toLowerCase()
    if (isPrivateHost(host)) throw new Error('That host is not allowed.')
    const placeholder = isPlaceholderHost(host)
    if (placeholder && source.purpose !== 'placeholder') {
      throw new Error(
        `${host} is a placeholder/stock image service — do not substitute it for hero, product or brand imagery. ` +
          `Upload the real asset (or the design reference, then crop_media it). ` +
          `Only if you deliberately need a labelled stand-in, pass purpose:"placeholder".`
      )
    }
    const res = await fetch(parsed)
    if (!res.ok) throw new Error('Could not fetch that image URL.')
    const ct = res.headers.get('content-type') ?? ''
    if (!/^image\//i.test(ct))
      throw new Error(`That URL did not return an image (content-type: ${ct || 'unknown'}).`)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared && declared > MAX_MEDIA_BYTES) throw new Error('Image exceeds the 25MB limit.')
    bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('Image exceeds the 25MB limit.')
    name = basename(parsed.pathname) || 'upload'
    origin = source.purpose === 'placeholder' || placeholder ? 'placeholder' : source.purpose === 'reference' ? 'reference' : 'url'
    sourceUrl = parsed.toString()
  } else {
    throw new Error('Provide either a local `path` or a `url` to upload.')
  }

  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart]), name)
  form.append('origin', origin)
  if (sourceUrl) form.append('sourceUrl', sourceUrl)
  if (source.alt) form.append('alt', source.alt)
  if (source.title) form.append('title', source.title)
  const res = await fetch(url('/api/mcp/v1/media'), {
    method: 'POST',
    headers: { ...authHeader() },
    body: form,
  })
  const body = await parse(res)
  if (!res.ok) {
    throw new ApiError(
      res.status,
      messageFrom(body, `media upload failed with ${res.status}`),
      body
    )
  }
  return body
}
