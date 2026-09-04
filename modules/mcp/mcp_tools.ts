import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * The single, transport-agnostic definition of the Driftless MCP tool set.
 *
 * Every tool is expressed as a call the host makes on the caller's behalf, via
 * two injected functions:
 *
 * - `call(method, path, body)` — a JSON request to the builder-API.
 * - `uploadMedia({ path?, url? })` — a multipart upload.
 *
 * The in-app Streamable-HTTP transport (`controllers/mcp_rpc_controller.ts`)
 * injects functions that **forward to the local builder-API carrying the
 * caller's bearer token**, so every existing guard — token ability ∩ RBAC, the
 * content validator, the rate limiter — applies with zero duplication. (The
 * standalone stdio client in `server/` mirrors this set over its own HTTP
 * client; keep the two in sync.)
 */
export interface ToolDeps {
  call: (method: string, path: string, body?: unknown) => Promise<unknown>
  uploadMedia: (source: { path?: string; url?: string }) => Promise<unknown>
}

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { call, uploadMedia } = deps

  const run = async (fn: () => Promise<unknown>): Promise<ToolResult> => {
    try {
      const result = await fn()
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true }
    }
  }

  const PuckDoc = z
    .record(z.any())
    .describe(
      'A Puck document: { root: { props: {} }, content: [ blocks ] }. Call get_block_catalog first.'
    )

  // ── Discovery ────────────────────────────────────────────────────────────
  server.tool(
    'get_block_catalog',
    "List every block type you may use in page/collection/email content, with each block's fields, slots (nestable children) and shared styleProps. ALWAYS call this before composing content.",
    { type: z.enum(['page', 'collection', 'email']).default('page') },
    ({ type }) => run(() => call('GET', `/api/mcp/v1/catalog?type=${type}`))
  )
  server.tool('list_collections', 'List all content collections (models).', {}, () =>
    run(() => call('GET', '/api/mcp/v1/collections'))
  )
  server.tool(
    'get_collection',
    'Get one collection with its fields.',
    { key: z.string() },
    ({ key }) => run(() => call('GET', `/api/mcp/v1/collections/${key}`))
  )
  server.tool('list_pages', 'List all pages.', {}, () =>
    run(() => call('GET', '/api/mcp/v1/pages'))
  )
  server.tool('get_page', 'Get one page by id.', { id: z.string() }, ({ id }) =>
    run(() => call('GET', `/api/mcp/v1/pages/${id}`))
  )
  server.tool(
    'list_templates',
    'List reusable templates (HEADER/FOOTER/LAYOUT/COMPONENT/EMAIL/COLLECTION).',
    { type: z.string().optional() },
    ({ type }) => run(() => call('GET', `/api/mcp/v1/templates${type ? `?type=${type}` : ''}`))
  )
  server.tool('get_template', 'Get one template by id.', { id: z.string() }, ({ id }) =>
    run(() => call('GET', `/api/mcp/v1/templates/${id}`))
  )
  server.tool(
    'list_records',
    'List records in a collection.',
    {
      collection: z.string(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      search: z.string().optional(),
    },
    ({ collection, page, pageSize, search }) => {
      const q = new URLSearchParams()
      if (page !== undefined) q.set('page', String(page))
      if (pageSize !== undefined) q.set('pageSize', String(pageSize))
      if (search) q.set('search', search)
      const qs = q.toString()
      return run(() => call('GET', `/api/v1/cms/${collection}/records${qs ? `?${qs}` : ''}`))
    }
  )

  // ── Collections + fields ───────────────────────────────────────────────────
  const FieldInput = {
    key: z.string(),
    label: z.string(),
    type: z
      .string()
      .describe(
        'A CMS field type, e.g. TEXT, RICHTEXT, NUMBER, BOOLEAN, DATE, MEDIA, RELATION, SELECT.'
      ),
    required: z.boolean().optional(),
    unique: z.boolean().optional(),
    config: z.record(z.any()).optional(),
  }
  server.tool(
    'create_collection',
    'Create a content collection (model). Optionally seed its fields.',
    {
      key: z.string().describe('lowercase, unique identifier'),
      label: z.string(),
      icon: z.string().optional(),
      group: z.string().optional(),
      revisionsOn: z.boolean().optional(),
      draftsOn: z.boolean().optional(),
      kind: z.enum(['collection', 'single']).optional(),
      fields: z.array(z.object(FieldInput)).optional(),
    },
    (args) => run(() => call('POST', '/api/mcp/v1/collections', args))
  )
  server.tool(
    'update_collection',
    "Update a collection's metadata (label/icon/group/toggles/kind).",
    {
      key: z.string(),
      label: z.string().optional(),
      icon: z.string().optional(),
      group: z.string().optional(),
      revisionsOn: z.boolean().optional(),
      draftsOn: z.boolean().optional(),
      kind: z.enum(['collection', 'single']).optional(),
    },
    ({ key, ...body }) => run(() => call('PUT', `/api/mcp/v1/collections/${key}`, body))
  )
  server.tool('delete_collection', 'Delete a collection.', { key: z.string() }, ({ key }) =>
    run(() => call('DELETE', `/api/mcp/v1/collections/${key}`))
  )
  server.tool(
    'add_field',
    'Add a field to a collection.',
    { collection: z.string(), ...FieldInput },
    ({ collection, ...body }) =>
      run(() => call('POST', `/api/mcp/v1/collections/${collection}/fields`, body))
  )
  server.tool(
    'update_field',
    "Update a field's label or config.",
    {
      collection: z.string(),
      field: z.string(),
      label: z.string().optional(),
      config: z.record(z.any()).optional(),
    },
    ({ collection, field, ...body }) =>
      run(() => call('PUT', `/api/mcp/v1/collections/${collection}/fields/${field}`, body))
  )
  server.tool(
    'delete_field',
    'Delete a field from a collection.',
    { collection: z.string(), field: z.string() },
    ({ collection, field }) =>
      run(() => call('DELETE', `/api/mcp/v1/collections/${collection}/fields/${field}`))
  )
  server.tool(
    'reorder_fields',
    "Reorder a collection's fields.",
    { collection: z.string(), fieldKeys: z.array(z.string()) },
    ({ collection, fieldKeys }) =>
      run(() =>
        call('PATCH', `/api/mcp/v1/collections/${collection}/fields/reorder`, { fieldKeys })
      )
  )

  // ── Records ────────────────────────────────────────────────────────────────
  server.tool(
    'create_record',
    'Create a record in a collection. `data` holds the field values keyed by field key.',
    {
      collection: z.string(),
      data: z.record(z.any()),
      status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    },
    ({ collection, data, status }) =>
      run(() => call('POST', `/api/v1/cms/${collection}/records`, { data, status }))
  )
  server.tool(
    'update_record',
    'Update a record.',
    {
      collection: z.string(),
      id: z.string(),
      data: z.record(z.any()).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    },
    ({ collection, id, data, status }) =>
      run(() => call('PUT', `/api/v1/cms/${collection}/records/${id}`, { data, status }))
  )
  server.tool(
    'delete_record',
    'Delete a record.',
    { collection: z.string(), id: z.string() },
    ({ collection, id }) => run(() => call('DELETE', `/api/v1/cms/${collection}/records/${id}`))
  )

  // ── Pages ──────────────────────────────────────────────────────────────────
  const PageMeta = {
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    renderMode: z.string().optional(),
    layoutId: z.string().nullable().optional(),
    headerTemplateId: z.string().nullable().optional(),
    footerTemplateId: z.string().nullable().optional(),
    hideHeader: z.boolean().optional(),
    hideFooter: z.boolean().optional(),
    seo: z.record(z.any()).optional(),
  }
  server.tool(
    'create_page',
    'Create a page. `content` (optional) is a Puck document validated against the catalog.',
    { title: z.string(), path: z.string(), content: PuckDoc.optional(), ...PageMeta },
    (args) => run(() => call('POST', '/api/mcp/v1/pages', args))
  )
  server.tool(
    'update_page',
    "Update a page's settings and/or live content.",
    {
      id: z.string(),
      title: z.string().optional(),
      path: z.string().optional(),
      content: PuckDoc.optional(),
      ...PageMeta,
    },
    ({ id, ...body }) => run(() => call('PUT', `/api/mcp/v1/pages/${id}`, body))
  )
  server.tool(
    'set_page_content',
    "Stage a Puck document as the page's draft (like the builder's autosave). Publish to make it live.",
    { id: z.string(), content: PuckDoc, seo: z.record(z.any()).optional() },
    ({ id, content, seo }) =>
      run(() => call('PUT', `/api/mcp/v1/pages/${id}/content`, { content, seo }))
  )
  server.tool(
    'validate_page_content',
    'Check a Puck document against the block catalog WITHOUT writing it. Use before publishing.',
    { content: PuckDoc },
    ({ content }) => run(() => call('POST', '/api/mcp/v1/pages/validate', { content }))
  )
  server.tool(
    'publish_page',
    'Publish a page: promotes the staged draft, or the explicit `content` if given.',
    { id: z.string(), content: PuckDoc.optional(), seo: z.record(z.any()).optional() },
    ({ id, ...body }) => run(() => call('POST', `/api/mcp/v1/pages/${id}/publish`, body))
  )

  // ── Templates ──────────────────────────────────────────────────────────────
  server.tool(
    'create_template',
    'Create a reusable template.',
    {
      name: z.string(),
      type: z.enum(['HEADER', 'FOOTER', 'LAYOUT', 'COMPONENT', 'EMAIL', 'COLLECTION']),
      content: PuckDoc.optional(),
      isDefault: z.boolean().optional(),
      collectionKey: z.string().nullable().optional(),
    },
    (args) => run(() => call('POST', '/api/mcp/v1/templates', args))
  )
  server.tool(
    'update_template',
    'Update a template.',
    {
      id: z.string(),
      name: z.string().optional(),
      content: PuckDoc.optional(),
      isDefault: z.boolean().optional(),
      collectionKey: z.string().nullable().optional(),
    },
    ({ id, ...body }) => run(() => call('PUT', `/api/mcp/v1/templates/${id}`, body))
  )
  server.tool(
    'set_default_template',
    'Make a template the default for its type.',
    { id: z.string() },
    ({ id }) => run(() => call('POST', `/api/mcp/v1/templates/${id}/default`))
  )

  // ── Appearance + site config ────────────────────────────────────────────────
  server.tool(
    'set_appearance',
    'Set the public theme: font, primary/secondary colours, and named saved-colour variables. Only the fields you pass are changed.',
    {
      fontFamily: z.string().optional(),
      fontCssUrl: z.string().optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      savedColors: z
        .array(z.object({ slug: z.string(), name: z.string(), value: z.string() }))
        .optional()
        .describe('Named colour variables, published as var(--color-<slug>).'),
    },
    (args) => run(() => call('PUT', '/api/mcp/v1/appearance', args))
  )
  server.tool(
    'set_global_code',
    'Replace the site-wide custom code snippets (CSS/JS injected on every page).',
    { snippets: z.array(z.record(z.any())) },
    ({ snippets }) => run(() => call('PUT', '/api/mcp/v1/global-code', { snippets }))
  )

  // ── Media ────────────────────────────────────────────────────────────────────
  server.tool(
    'upload_media',
    'Upload an image/file from a local path or a URL. Returns the media record (its `url` is what you put in image blocks).',
    { path: z.string().optional(), url: z.string().optional() },
    ({ path, url }) => run(() => uploadMedia({ path, url }))
  )
}
