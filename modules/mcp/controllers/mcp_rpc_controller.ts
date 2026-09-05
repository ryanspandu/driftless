import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import env from '#start/env'
import server from '@adonisjs/core/services/server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerTools, type ToolDeps, type UploadSource } from '#modules/mcp/mcp_tools'
import {
  assertFetchableImageUrl,
  originForPath,
  originForUrl,
  MAX_MEDIA_BYTES,
} from '#modules/mcp/services/image_url_guard'

/**
 * In-app MCP endpoint (Phase 2, item #1).
 *
 * Exposes the Model Context Protocol over Streamable HTTP **inside** Driftless,
 * so a remote AI client connects with a bearer token — no local stdio install.
 * It is stateless (`sessionIdGenerator: undefined`, `enableJsonResponse: true`):
 * a fresh `McpServer` + transport per request, torn down after.
 *
 * Guard model — **forward to the builder-API**. Each tool's handler does not
 * touch a service directly; it makes an internal HTTP call to this same app's
 * `/api/mcp/v1/*` (or `/api/v1/cms/*`) carrying the caller's token. So every
 * existing guard runs unchanged: token ability ∩ RBAC (per-route middleware),
 * the Puck content validator, and the rate limiter. Zero guard duplication.
 *
 * The RPC route itself only requires a valid token (the `auth:api` guard) +
 * `moduleEnabled`; real authorization happens on each forwarded call.
 */
export default class McpRpcController {
  async handle(ctx: HttpContext) {
    const { request, response } = ctx

    // The forward is explicitly a call to THIS process, so build the origin from
    // a trusted source — NEVER the client-controlled Host header (that would be an
    // authenticated SSRF that also ships the caller's bearer token to an arbitrary
    // host, and breaks on any topology where the public host isn't reachable
    // internally). Host is the constant `localhost` (NOT the attacker-controlled
    // Host header), so it resolves on whichever loopback family the server bound
    // to (IPv4 127.0.0.1 or IPv6 ::1), with its ACTUAL bound port (tests use an
    // ephemeral one).
    const origin = `http://localhost:${this.loopbackPort()}`
    const authorization = request.header('authorization') ?? ''
    const deps = this.buildDeps(origin, authorization)

    const server = new McpServer({ name: 'driftless', version: '1.0.0' })
    registerTools(server, deps)

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    try {
      await server.connect(transport)

      const method = request.method()
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const webRequest = new Request(`${origin}${request.url(true)}`, {
        method,
        headers: this.incomingHeaders(request.headers()),
        body: hasBody ? JSON.stringify(request.body()) : undefined,
      })

      const webResponse = await transport.handleRequest(webRequest, {
        parsedBody: hasBody ? request.body() : undefined,
      })

      response.status(webResponse.status)
      webResponse.headers.forEach((value, key) => {
        // Let Adonis manage the framing headers.
        if (key === 'content-length' || key === 'transfer-encoding') return
        response.header(key, value)
      })
      return response.send(await webResponse.text())
    } finally {
      await transport.close().catch(() => {})
      await server.close().catch(() => {})
    }
  }

  /**
   * The port THIS process is actually listening on — used to forward tool calls
   * to our own builder-API over loopback. Prefers the live Node server address
   * (correct even when tests bind an ephemeral port), falling back to env.PORT.
   */
  private loopbackPort(): number {
    const addr = server.getNodeServer()?.address()
    if (addr && typeof addr === 'object' && typeof addr.port === 'number') return addr.port
    return Number(env.get('PORT', 3333))
  }

  /** Copy incoming headers into the shape the Web `Request` wants. */
  private incomingHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue
      out[key] = Array.isArray(value) ? value.join(', ') : value
    }
    // The Streamable-HTTP transport requires the client to accept JSON; ensure it.
    if (!out['accept']) out['accept'] = 'application/json, text/event-stream'
    return out
  }

  /**
   * Tool dependencies that forward to this same app over HTTP, carrying the
   * caller's token so every guard on the builder-API applies.
   */
  private buildDeps(origin: string, authorization: string): ToolDeps {
    const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
      const headers: Record<string, string> = { Authorization: authorization }
      let payload: string | undefined
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
        payload = JSON.stringify(body)
      }
      const res = await fetch(`${origin}${path}`, { method, headers, body: payload })
      return this.parseForwarded(res, `${method} ${path}`)
    }

    const uploadMedia = async (source: UploadSource): Promise<unknown> => {
      let bytes: Uint8Array
      let name: string
      let mediaOrigin: string
      let sourceUrl: string | null = null
      if (source.path) {
        bytes = await readFile(source.path)
        name = basename(source.path)
        mediaOrigin = originForPath(source.purpose)
      } else if (source.url) {
        // Reject placeholder hosts (unless purpose:"placeholder") and private
        // network targets BEFORE fetching anything.
        const { url, isPlaceholder } = assertFetchableImageUrl(source.url, source.purpose)
        const fetched = await fetch(url)
        if (!fetched.ok) throw new Error('Could not fetch that image URL.')
        const ct = fetched.headers.get('content-type') ?? ''
        if (!/^image\//i.test(ct)) {
          throw new Error(`That URL did not return an image (content-type: ${ct || 'unknown'}).`)
        }
        const declared = Number(fetched.headers.get('content-length') ?? 0)
        if (declared && declared > MAX_MEDIA_BYTES) throw new Error('Image exceeds the 25MB limit.')
        bytes = new Uint8Array(await fetched.arrayBuffer())
        if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error('Image exceeds the 25MB limit.')
        name = basename(url.pathname) || 'upload'
        mediaOrigin = originForUrl(source.purpose, isPlaceholder)
        sourceUrl = url.toString()
      } else {
        throw new Error('Provide either a local `path` or a `url` to upload.')
      }
      const form = new FormData()
      // Copy into a fresh ArrayBuffer-backed view so the Blob type is satisfied.
      form.append('file', new Blob([new Uint8Array(bytes)]), name)
      form.append('origin', mediaOrigin)
      if (sourceUrl) form.append('sourceUrl', sourceUrl)
      if (source.alt) form.append('alt', source.alt)
      if (source.title) form.append('title', source.title)
      const res = await fetch(`${origin}/api/mcp/v1/media`, {
        method: 'POST',
        headers: { Authorization: authorization },
        body: form,
      })
      return this.parseForwarded(res, 'POST /api/mcp/v1/media')
    }

    return { call, uploadMedia }
  }

  private async parseForwarded(res: Response, label: string): Promise<unknown> {
    const text = await res.text()
    let body: unknown = text
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        /* keep as text */
      }
    }
    if (!res.ok) {
      // Preserve structured validation detail (issues[]/errors[]) so the AI can
      // self-correct — collapsing it to a bare `message` hides why content was
      // rejected.
      let detail: string
      if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>
        if ('issues' in obj || 'errors' in obj) {
          detail = JSON.stringify(obj)
        } else if ('message' in obj) {
          detail = String(obj.message)
        } else {
          detail = JSON.stringify(obj)
        }
      } else {
        detail = text || `${label} failed with ${res.status}`
      }
      throw new Error(`HTTP ${res.status}: ${detail}`)
    }
    return body
  }
}
