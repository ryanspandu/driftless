#!/usr/bin/env node
/**
 * Driftless MCP server — lets an AI client (Claude/Codex desktop) build a whole
 * Driftless site: collections + fields, records, pages (Puck content),
 * templates, appearance and media.
 *
 * It is a **thin stdio client** over the Driftless builder-API. Each tool is an
 * HTTP call (see `client.ts`); the server stays the validation authority. Point
 * it at any Driftless instance with `DRIFTLESS_URL` + `DRIFTLESS_TOKEN`.
 *
 * Recommended flow the tool descriptions steer toward:
 *   get_block_catalog → (create_collection / add_field) → create_page →
 *   set_page_content (a valid Puck doc) → validate_page_content → publish_page
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { api, uploadMedia, ApiError } from './client.js'

const server = new McpServer({ name: 'driftless', version: '1.0.0' })

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

/** Run an API call and render its result (or error) as MCP tool output. */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const result = await fn()
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    const err = e as ApiError
    const detail =
      err instanceof ApiError
        ? `HTTP ${err.status}: ${err.message}${err.body ? `\n${JSON.stringify(err.body, null, 2)}` : ''}`
        : (e as Error).message
    return { content: [{ type: 'text', text: `Error: ${detail}` }], isError: true }
  }
}

const PuckDoc = z
  .record(z.any())
  .describe(
    'A Puck document: { root: { props: {} }, content: [ blocks ] }. Call get_block_catalog first.'
  )

// ── Discovery ────────────────────────────────────────────────────────────────

server.tool(
  'get_block_catalog',
  "List every block type you may use in page/collection/email content, with each block's fields, slots (nestable children) and shared styleProps. ALWAYS call this before composing content.",
  { type: z.enum(['page', 'collection', 'email']).default('page') },
  ({ type }) => run(() => api.get('/api/mcp/v1/catalog', { type }))
)

server.tool('list_collections', 'List all content collections (models).', {}, () =>
  run(() => api.get('/api/mcp/v1/collections'))
)

server.tool(
  'get_collection',
  'Get one collection with its fields.',
  { key: z.string() },
  ({ key }) => run(() => api.get(`/api/mcp/v1/collections/${key}`))
)

server.tool('list_pages', 'List all pages.', {}, () => run(() => api.get('/api/mcp/v1/pages')))

server.tool('get_page', 'Get one page by id.', { id: z.string() }, ({ id }) =>
  run(() => api.get(`/api/mcp/v1/pages/${id}`))
)

server.tool(
  'list_templates',
  'List reusable templates (HEADER/FOOTER/LAYOUT/COMPONENT/EMAIL/COLLECTION).',
  { type: z.string().optional() },
  ({ type }) => run(() => api.get('/api/mcp/v1/templates', { type }))
)

server.tool('get_template', 'Get one template by id.', { id: z.string() }, ({ id }) =>
  run(() => api.get(`/api/mcp/v1/templates/${id}`))
)

server.tool(
  'list_records',
  'List records in a collection. Requires the token ability `cms:read` (separate from the builder:* scopes; a 403 means the token is missing it).',
  {
    collection: z.string(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
    search: z.string().optional(),
  },
  ({ collection, page, pageSize, search }) =>
    run(() => api.get(`/api/v1/cms/${collection}/records`, { page, pageSize, search }))
)

// ── Collections + fields (schema) ──────────────────────────────────────────────

const KEY_RULE =
  'lowercase snake_case: must match ^[a-z][a-z0-9_]{0,31}$ (start with a letter, then letters/digits/underscore, max 32 chars). No camelCase, hyphens or spaces, and not a reserved word (id, status, order, group, user, role, created_at, …).'
const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, KEY_RULE)

const FieldInput = {
  key: keySchema.describe(`Field key — ${KEY_RULE}`),
  label: z.string(),
  type: z
    .enum([
      'TEXT',
      'TEXTAREA',
      'NUMBER',
      'INTEGER',
      'DECIMAL',
      'BOOL',
      'DATE',
      'DATETIME',
      'SELECT',
      'EMAIL',
      'PASSWORD',
      'RICHTEXT',
      'MEDIA',
      'SLUG',
      'JSON',
      'REPEATABLE',
      'RELATION',
      'COMPONENT',
    ])
    .describe(
      'CMS field type. Use BOOL (not BOOLEAN). RELATION requires config.targetKey; SELECT stores plain text unless config.options is passed.'
    ),
  required: z
    .boolean()
    .optional()
    .describe(
      'Only honored by create_collection. add_field IGNORES/REJECTS required=true — a new column added to an existing collection must be optional.'
    ),
  unique: z
    .boolean()
    .optional()
    .describe(
      'Only applies to TEXT, EMAIL, SLUG, NUMBER, INTEGER, DECIMAL — silently ignored for other types.'
    ),
  config: z
    .record(z.any())
    .optional()
    .describe(
      'Type-specific config. RELATION: { targetKey: <existing dynamic collection key>, relationType: "manyToOne"|"oneToOne"|"manyToMany"|"oneToMany" (default manyToOne) }. SELECT: { options: string[] }. SLUG: { source: <field key> }.'
    ),
}

server.tool(
  'create_collection',
  'Create a content collection (model). Optionally seed its fields (all-or-nothing). Keys must be lowercase snake_case and not a built-in collection (posts; products when the store module is on) — call list_collections to see existing/reserved keys.',
  {
    key: keySchema.describe(`Unique collection key — ${KEY_RULE} Also cannot be a built-in (posts/products).`),
    label: z.string(),
    icon: z.string().optional(),
    group: z.string().optional(),
    revisionsOn: z.boolean().optional(),
    draftsOn: z.boolean().optional(),
    kind: z.enum(['collection', 'single']).optional(),
    fields: z.array(z.object(FieldInput)).optional(),
  },
  (args) => run(() => api.post('/api/mcp/v1/collections', args))
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
  ({ key, ...body }) => run(() => api.put(`/api/mcp/v1/collections/${key}`, body))
)

server.tool(
  'delete_collection',
  'Move a collection to Trash (reversible soft-delete; its table is kept). Use force_delete_collection to remove it permanently, or restore_collection to bring it back.',
  { key: z.string() },
  ({ key }) => run(() => api.del(`/api/mcp/v1/collections/${key}`))
)

server.tool(
  'list_trashed_collections',
  'List soft-deleted (trashed) collections — candidates for restore_collection or force_delete_collection.',
  {},
  () => run(() => api.get('/api/mcp/v1/collections/trashed'))
)

server.tool(
  'restore_collection',
  'Restore a trashed collection (undo delete_collection).',
  { key: z.string() },
  ({ key }) => run(() => api.post(`/api/mcp/v1/collections/${key}/restore`))
)

server.tool(
  'force_delete_collection',
  'Permanently delete a TRASHED collection: drops its table, relations and revisions. Irreversible. The collection must already be in Trash (call delete_collection first).',
  { key: z.string() },
  ({ key }) => run(() => api.del(`/api/mcp/v1/collections/${key}/force`))
)

server.tool(
  'add_field',
  'Add a field to a collection.',
  { collection: z.string(), ...FieldInput },
  ({ collection, ...body }) =>
    run(() => api.post(`/api/mcp/v1/collections/${collection}/fields`, body))
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
    run(() => api.put(`/api/mcp/v1/collections/${collection}/fields/${field}`, body))
)

server.tool(
  'delete_field',
  'Delete a field from a collection.',
  { collection: z.string(), field: z.string() },
  ({ collection, field }) =>
    run(() => api.del(`/api/mcp/v1/collections/${collection}/fields/${field}`))
)

server.tool(
  'reorder_fields',
  "Reorder a collection's fields.",
  { collection: z.string(), fieldKeys: z.array(z.string()) },
  ({ collection, fieldKeys }) =>
    run(() => api.patch(`/api/mcp/v1/collections/${collection}/fields/reorder`, { fieldKeys }))
)

// ── Records ────────────────────────────────────────────────────────────────────

server.tool(
  'create_record',
  'Create a record in a collection. `data` holds the field values keyed by field key. Requires the token ability `cms:write`. Note: the built-in `products` collection is managed by the E-commerce module and is NOT writable here — use a custom collection for arbitrary product-like data.',
  {
    collection: z.string(),
    data: z.record(z.any()),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  },
  ({ collection, data, status }) =>
    run(() => api.post(`/api/v1/cms/${collection}/records`, { data, status }))
)

server.tool(
  'update_record',
  'Update a record. Requires the token ability `cms:write`.',
  {
    collection: z.string(),
    id: z.string(),
    data: z.record(z.any()).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  },
  ({ collection, id, data, status }) =>
    run(() => api.put(`/api/v1/cms/${collection}/records/${id}`, { data, status }))
)

server.tool(
  'delete_record',
  'Delete a record. Requires the token ability `cms:write`.',
  { collection: z.string(), id: z.string() },
  ({ collection, id }) => run(() => api.del(`/api/v1/cms/${collection}/records/${id}`))
)

// ── Pages ──────────────────────────────────────────────────────────────────────

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
  (args) => run(() => api.post('/api/mcp/v1/pages', args))
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
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/pages/${id}`, body))
)

server.tool(
  'set_page_content',
  "Stage a Puck document as the page's draft (like the builder's autosave). Publish to make it live.",
  { id: z.string(), content: PuckDoc, seo: z.record(z.any()).optional() },
  ({ id, content, seo }) => run(() => api.put(`/api/mcp/v1/pages/${id}/content`, { content, seo }))
)

server.tool(
  'validate_page_content',
  'Check a Puck document against the block catalog WITHOUT writing it. Use before publishing.',
  { content: PuckDoc },
  ({ content }) => run(() => api.post('/api/mcp/v1/pages/validate', { content }))
)

server.tool(
  'publish_page',
  'Publish a page: promotes the staged draft, or the explicit `content` if given.',
  { id: z.string(), content: PuckDoc.optional(), seo: z.record(z.any()).optional() },
  ({ id, ...body }) => run(() => api.post(`/api/mcp/v1/pages/${id}/publish`, body))
)

server.tool(
  'discard_draft',
  "Discard a page's staged draft (from set_page_content), reverting the editor to the live design.",
  { id: z.string() },
  ({ id }) => run(() => api.post(`/api/mcp/v1/pages/${id}/discard-draft`))
)

// ── Templates ────────────────────────────────────────────────────────────────

server.tool(
  'create_template',
  'Create a reusable template. IMPORTANT: compose `content` from the catalog that matches the template type — call get_block_catalog(type=email) for EMAIL, type=collection for COLLECTION, otherwise type=page (page blocks are rejected in EMAIL/COLLECTION templates).',
  {
    name: z.string(),
    type: z.enum(['HEADER', 'FOOTER', 'LAYOUT', 'COMPONENT', 'EMAIL', 'COLLECTION']),
    content: PuckDoc.optional(),
    isDefault: z.boolean().optional(),
    collectionKey: z.string().nullable().optional(),
  },
  (args) => run(() => api.post('/api/mcp/v1/templates', args))
)

server.tool('delete_template', 'Delete a template by id.', { id: z.string() }, ({ id }) =>
  run(() => api.del(`/api/mcp/v1/templates/${id}`))
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
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/templates/${id}`, body))
)

server.tool(
  'set_default_template',
  'Make a template the default for its type.',
  { id: z.string() },
  ({ id }) => run(() => api.post(`/api/mcp/v1/templates/${id}/default`))
)

// ── Appearance + site config ───────────────────────────────────────────────────

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
  (args) => run(() => api.put('/api/mcp/v1/appearance', args))
)

server.tool(
  'set_global_code',
  'Replace the site-wide custom code snippets (CSS/JS injected on every page).',
  { snippets: z.array(z.record(z.any())) },
  ({ snippets }) => run(() => api.put('/api/mcp/v1/global-code', { snippets }))
)

server.tool(
  'set_breakpoints',
  'Replace the site-wide responsive breakpoint tiers (Webflow-style). Affects the @media CSS baked into every page.',
  { breakpoints: z.array(z.record(z.any())) },
  ({ breakpoints }) => run(() => api.put('/api/mcp/v1/breakpoints', { breakpoints }))
)

// ── Media ──────────────────────────────────────────────────────────────────────

server.tool(
  'list_media',
  'List already-uploaded media (images/files) — reuse an existing `url` instead of re-uploading.',
  { page: z.number().optional(), pageSize: z.number().optional(), search: z.string().optional() },
  ({ page, pageSize, search }) => run(() => api.get('/api/mcp/v1/media', { page, pageSize, search }))
)

server.tool(
  'upload_media',
  'Upload an image/file from a local path or a URL. Returns the media record (its `url` is what you put in image blocks).',
  { path: z.string().optional(), url: z.string().optional() },
  ({ path, url }) => run(() => uploadMedia({ path, url }))
)

// ── Boot ───────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Log to stderr — stdout is the MCP protocol channel.
  process.stderr.write(
    `driftless-mcp connected to ${process.env.DRIFTLESS_URL || 'http://localhost:3333'}\n`
  )
}

main().catch((e) => {
  process.stderr.write(`driftless-mcp failed to start: ${(e as Error).message}\n`)
  process.exit(1)
})
