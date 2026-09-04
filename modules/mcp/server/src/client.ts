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

/**
 * Upload media. The server only accepts multipart, so a source URL is fetched
 * here and posted as bytes — keeping the server's single audited ingest path.
 */
export async function uploadMedia(source: { path?: string; url?: string }): Promise<unknown> {
  let bytes: Uint8Array
  let name: string
  if (source.path) {
    bytes = await readFile(source.path)
    name = basename(source.path)
  } else if (source.url) {
    const res = await fetch(source.url)
    if (!res.ok) throw new Error(`Could not fetch ${source.url}: ${res.status}`)
    bytes = new Uint8Array(await res.arrayBuffer())
    name = basename(new URL(source.url).pathname) || 'upload'
  } else {
    throw new Error('Provide either a local `path` or a `url` to upload.')
  }

  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart]), name)
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
