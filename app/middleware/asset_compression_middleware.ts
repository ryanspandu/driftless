import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import app from '@adonisjs/core/services/app'
import { readFile } from 'node:fs/promises'
import { normalize } from 'node:path'
import zlib from 'node:zlib'
import { promisify } from 'node:util'

/**
 * Compress hashed build assets (`/assets/*`) on the fly.
 *
 * The AdonisJS static server ships assets uncompressed, which under a throttled
 * mobile connection makes the render-blocking CSS the dominant cost (~243KB of
 * CSS → ~5s of render-blocking transfer). Brotli/gzip cut that ~87% (243KB →
 * ~32KB). In production a reverse proxy (nginx/Cloudflare) normally does this;
 * this keeps a bare self-host (no proxy) fast too.
 *
 * **Proxy-safe by construction.** It only compresses when the request that
 * *reaches the app* advertises `Accept-Encoding`. A proxy that strips
 * Accept-Encoding to its upstream (so it can compress itself) makes this a no-op
 * — the proxy wins. A proxy that forwards it gets an already-encoded response
 * and passes it through (nginx never double-compresses a response that already
 * carries `Content-Encoding`). Either way: no double-encoding, no error.
 *
 * Runs before the static middleware. Scoped to `/assets/*` (content-hashed, so
 * safe to mark immutable); every other path falls straight through.
 */

const brotli = promisify(zlib.brotliCompress)
const gzip = promisify(zlib.gzip)

/** Compressible, hashed asset types. Fonts/images are already compressed. */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

// Compressed bodies are cached for the process lifetime: assets are
// content-hashed (immutable), and a release restarts the process, so the cache
// can never serve a stale build. Keyed by `<encoding>:<relative path>`.
const cache = new Map<string, Buffer>()

// A middleweight brotli quality (default 11 is slow enough to stall the first
// request for the ~860KB app bundle). 6 keeps most of the ratio for a fraction
// of the time, and the result is cached anyway.
const brotliOpts = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }

export default class AssetCompressionMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    if (request.method() !== 'GET' && request.method() !== 'HEAD') return next()

    const path = request.url() // path only (no query string) in AdonisJS
    if (!path.startsWith('/assets/')) return next()

    const ext = path.slice(path.lastIndexOf('.'))
    const type = TYPES[ext]
    if (!type) return next()

    const accept = request.header('accept-encoding') || ''
    const encoding = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
    if (!encoding) return next() // proxy stripped it, or an ancient client → let static serve

    // Resolve within public/ and refuse anything that escapes it (path traversal).
    const publicRoot = normalize(app.makePath('public'))
    const filePath = normalize(app.makePath('public' + path))
    if (!filePath.startsWith(publicRoot)) return next()

    const cacheKey = `${encoding}:${path}`
    let body = cache.get(cacheKey)
    if (!body) {
      let raw: Buffer
      try {
        raw = await readFile(filePath)
      } catch {
        return next() // not found → let the static middleware answer (404 etc.)
      }
      body = encoding === 'br' ? await brotli(raw, brotliOpts) : await gzip(raw)
      cache.set(cacheKey, body)
    }

    response.header('Content-Type', type)
    response.header('Content-Encoding', encoding)
    response.header('Vary', 'Accept-Encoding')
    // Hashed filenames never change — cache hard.
    response.header('Cache-Control', 'public, max-age=31536000, immutable')
    return response.status(200).send(request.method() === 'HEAD' ? null : body)
  }
}
