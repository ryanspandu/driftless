import type { HttpContext } from '@adonisjs/core/http'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { registerTools, type ToolDeps } from '#modules/mcp/mcp_tools'

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

    const origin = `${request.protocol()}://${request.host()}`
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

    const uploadMedia = async (source: { path?: string; url?: string }): Promise<unknown> => {
      let bytes: Uint8Array
      let name: string
      if (source.path) {
        bytes = await readFile(source.path)
        name = basename(source.path)
      } else if (source.url) {
        const fetched = await fetch(source.url)
        if (!fetched.ok) throw new Error(`Could not fetch ${source.url}: ${fetched.status}`)
        bytes = new Uint8Array(await fetched.arrayBuffer())
        name = basename(new URL(source.url).pathname) || 'upload'
      } else {
        throw new Error('Provide either a local `path` or a `url` to upload.')
      }
      const form = new FormData()
      // Copy into a fresh ArrayBuffer-backed view so the Blob type is satisfied.
      form.append('file', new Blob([new Uint8Array(bytes)]), name)
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
      const message =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `${label} failed with ${res.status}`
      throw new Error(`HTTP ${res.status}: ${message}`)
    }
    return body
  }
}
