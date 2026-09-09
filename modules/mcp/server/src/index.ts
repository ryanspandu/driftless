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

// MIRRORS SERVER_INSTRUCTIONS in `modules/mcp/mcp_tools.ts` — keep in sync.
const SERVER_INSTRUCTIONS = `Driftless page builder. To reproduce a design reference (a screenshot/mockup) faithfully, follow this loop — structure is easy to get right; palette, imagery and icons are what make or break fidelity:

0. PAGE TYPE FIRST — ask the operator whether they want a **page-builder page** (you compose Puck blocks: the default, and everything below) or a **custom template** (a coded template the operator supplied, which you only point a page at). For a custom template: call list_custom_templates, then create_page with kind:"CODE" and component:"kit:<id>", and STOP — do not build blocks or run the rest of this loop. Otherwise build with the page builder:

1. get_block_catalog — read the blocks, recipes, and the live \`theme\` (what variant:"primary" renders as).
2. If you have a reference image, upload_media(purpose:"reference") so you can crop real photos out of it.
3. BRAND FIRST: extract the design's palette + fonts and call set_appearance (exact hex). Button primary, product CTAs, FormButton and cart/checkout all render the theme colours — skip this and every CTA ships the default purple.
4. ASSET INVENTORY: for every image the design shows, get a REAL asset — crop_media it out of the reference, or upload_media a supplied file. NEVER substitute random stock/placeholder photos (they are rejected). A slot you can't fill must be reported, not faked.
5. set_design_brief (palette, iconStyle, the design's sections + asset slots) so the build can be checked.
6. Build with create_page / set_page_content. Use the styleProps for layout — flex (display:"flex", gap, justifyContent, alignItems), sizing, and position:"absolute" for overlays — not just spacing/colour. Use Icon with a curated name + textColor (or an uploaded icon src) — not emoji — unless the design uses emoji. Mobile/tablet responsive is added AUTOMATICALLY on save (grids drop columns, split rows stack, big headings shrink, tall heroes trim); it is additive, so only set your own responsive:{ … } overrides for anything you want different, or pass autoResponsive:false to do it all by hand.
7. validate_page_content (fix issues; heed the warnings AND the changes it reports — a filled id, a slot moved into props, an unknown prop that will be ignored) AND check_design_coverage — fix every missing/reordered section, off-brand CTA/colour, emoji icon and image substitution it lists.
8. render_page and READ the returned HTML — this is your ONLY look at the actual build; compare it to the reference and fix layout, spacing, sizing and text that coverage cannot see. To fix one block, patch_page_content by its props.id (a small diff) — do NOT re-send the whole page from memory, which is how revisions drift. Re-fetch get_page after a write to confirm your blocks/props survived.
9. SEO + PERFORMANCE + ACCESSIBILITY — a page-builder page is public and has to win at search and load fast:
   • SEO: set \`seo\` (a meta description AND an ogImage on every public page; canonical/robots as needed) and keep \`renderMode\` SSR (the default) — SSR puts the content and any Collection List data in the initial HTML, so it is indexable; CSR ships empty HTML and must never be used for a public/SEO page. SSG is fine for pages whose data rarely changes.
   • Performance: right-size images (crop_media to the display size — a huge photo shrunk into a card is wasted bytes) and keep any global JS (set_global_code) tiny, since it runs on every page.
   • Accessibility: give every image real alt text and keep one <h1> with a sane heading order.
10. get_preview_url for the operator to look, then publish_page. Report any residual mismatches/substitutions you could not resolve.`

const server = new McpServer(
  { name: 'driftless', version: '1.0.0' },
  { instructions: SERVER_INSTRUCTIONS }
)

/**
 * Optional tool allowlist for tool-budget-limited clients. Set DRIFTLESS_MCP_TOOLS
 * (comma list) or DRIFTLESS_MCP_PROFILE=pages in the MCP client config to expose
 * a focused subset instead of all ~80. MIRRORS MCP_TOOL_PROFILES / the in-app
 * `?profile=`/`?tools=` in `modules/mcp/mcp_tools.ts` — keep the 'pages' list in sync.
 */
const PROFILES: Record<string, string[]> = {
  pages: [
    'get_block_catalog', 'list_pages', 'get_page', 'list_custom_templates', 'create_page', 'update_page',
    'set_page_content', 'validate_page_content', 'render_page', 'patch_page_content',
    'publish_page', 'discard_draft', 'delete_page', 'get_appearance', 'set_appearance',
    'set_design_brief', 'check_design_coverage', 'get_preview_url', 'upload_media',
    'crop_media', 'list_media',
    'list_menus', 'get_menu', 'create_menu', 'set_menu_items',
  ],
}
;(() => {
  const t = process.env.DRIFTLESS_MCP_TOOLS
  const p = process.env.DRIFTLESS_MCP_PROFILE
  const only = t
    ? new Set(t.split(',').map((x) => x.trim()).filter(Boolean))
    : p && p !== 'full' && PROFILES[p]
      ? new Set(PROFILES[p])
      : null
  if (!only) return
  const realTool = server.tool.bind(server) as (...a: unknown[]) => unknown
  ;(server as unknown as { tool: (...a: unknown[]) => unknown }).tool = (...args: unknown[]) =>
    only.has(args[0] as string) ? realTool(...args) : undefined
})()

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
    'A Puck document: { root: { props: {} }, content: [ blocks ] }. Call get_block_catalog first. ' +
      'PER-PAGE custom code lives on the ROOT: set root.props.codeSnippets to an array of ' +
      '{ id, name, lang:"css"|"js", code, enabled } — CSS is concatenated into one <style>, each ' +
      'enabled JS snippet becomes its own <script>, and BOTH run only on THIS page (unlike ' +
      'set_global_code, which is site-wide). Keep any JS tiny for performance; a page carrying JS ' +
      'needs the settings:manage ability to save.'
  )

// The structured design brief (stored on the page, checked by coverage).
const DesignBrief = z
  .object({
    source: z
      .object({
        kind: z.enum(['png', 'figma', 'text']).optional(),
        referenceMediaId: z.string().optional().describe('The upload_media id of the reference image.'),
      })
      .optional(),
    palette: z
      .object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        bg: z.string().optional(),
        ink: z.string().optional(),
        accent: z.array(z.string()).optional(),
      })
      .optional()
      .describe('The design colours (hex). Apply them with set_appearance too.'),
    typography: z.object({ heading: z.string().optional(), body: z.string().optional() }).optional(),
    iconStyle: z.enum(['line', 'custom', 'emoji']).optional(),
    sections: z
      .array(
        z.object({
          key: z.string().describe('A short name for the design section (hero, trustBar, productGrid, …).'),
          recipe: z.string().optional().describe('The matching GUIDANCE_RECIPES section name.'),
          headline: z.string().optional().describe("The section's main heading text, for coverage matching."),
          assets: z
            .array(
              z.object({
                role: z.string(),
                status: z.enum(['supplied', 'placeholder', 'missing']).optional(),
                mediaId: z.string().optional(),
                url: z.string().optional(),
              })
            )
            .optional(),
        })
      )
      .optional()
      .describe("The design's sections in order, top to bottom."),
  })
  .passthrough()

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
      'MULTISELECT',
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
      'CMS field type. Use BOOL (not BOOLEAN). RELATION requires config.targetKey; SELECT stores a single chosen value and MULTISELECT stores an array of chosen values — both take their choices from config.options.'
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
      'Type-specific config. RELATION: { targetKey: <existing dynamic collection key>, relationType: "manyToOne"|"oneToOne"|"manyToMany"|"oneToMany" (default manyToOne) }. SELECT / MULTISELECT: { options: Array<string | { label, value }> } — a plain string is used as both label and value; a MULTISELECT record value is the array of chosen `value`s. SLUG: { source: <field key> }.'
    ),
}

server.tool(
  'create_collection',
  'Create a content collection (model). Optionally seed its fields (all-or-nothing). Keys must be lowercase snake_case and not a built-in collection (posts; products when the store module is on) — call list_collections to see existing/reserved keys.',
  {
    key: keySchema.describe(
      `Unique collection key — ${KEY_RULE} Also cannot be a built-in (posts/products).`
    ),
    label: z.string().describe('Human name shown in the admin (e.g. "Blog posts").'),
    icon: z.string().optional().describe('Optional lucide icon name for the admin nav.'),
    group: z.string().optional().describe('Optional admin-sidebar group heading to file this collection under.'),
    revisionsOn: z.boolean().optional().describe('Keep a version history of records.'),
    draftsOn: z.boolean().optional().describe('Allow Draft vs Published records (public reads return published only).'),
    kind: z
      .enum(['collection', 'single'])
      .optional()
      .describe(
        '"collection" (default) = many records (blog posts, products). "single" = exactly one record (a homepage/settings singleton).'
      ),
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

const autoResponsiveField = {
  autoResponsive: z
    .boolean()
    .optional()
    .describe(
      'Default true: the server auto-adds mobile/tablet responsive overrides (grids drop columns, split rows stack, big headings shrink, tall heroes trim). Additive — your own responsive is kept. Pass false to author responsive by hand.'
    ),
}
const SeoSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    canonical: z.string().optional(),
    noindex: z.boolean().optional(),
    meta: z
      .array(
        z.object({
          name: z.string().optional(),
          property: z.string().optional(),
          content: z.string(),
        })
      )
      .optional(),
    jsonLdCustom: z.string().optional(),
  })
  .describe(
    'SEO / <head> fields — set these on EVERY public page. `description` is the search-result snippet and `ogImage` the social-share image (both strongly recommended for SEO). `title` overrides the tab/SERP title (falls back to the page title). `canonical` is auto-derived from the path when unset; set `noindex:true` to keep a page out of search. `meta` adds extra <meta> tags ({ name|property, content }); `jsonLdCustom` is raw JSON-LD.'
  )

const PageMeta = {
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  renderMode: z
    .enum(['SSR', 'SSG', 'CSR'])
    .optional()
    .describe(
      'How the public page is delivered — leave unset to get SSR, the right choice for almost every page. SSR: server-rendered each request, so the page content AND any Collection List / bound CMS data are in the initial HTML — indexable by search engines and fast to first paint. SSG: a cached server-rendered snapshot (same SEO; best when the data rarely changes). CSR: client-only — the HTML ships EMPTY, so never use it for anything public or SEO-facing (reserve it for private/app-like pages). For a marketing or content page, keep it SSR.'
    ),
  kind: z
    .enum(['BUILDER', 'CODE'])
    .optional()
    .describe(
      'How the page is built. BUILDER (default) = a Puck document you compose with blocks (everything else in these instructions). CODE = a hand-written component or custom template the operator wrote — you do NOT author its markup, you only point at it via `component`. Ask the operator which they want before creating.'
    ),
  component: z
    .string()
    .optional()
    .describe(
      'Required when kind=CODE: what to render. A custom template is "kit:<id>" (call list_custom_templates for ids); a single-file code page is its bare slug. Leave unset for BUILDER.'
    ),
  layoutId: z
    .string()
    .nullable()
    .optional()
    .describe(
      'LAYOUT template id (from list_templates) that wraps the page and owns its own header/footer; null = the site default.'
    ),
  headerTemplateId: z
    .string()
    .nullable()
    .optional()
    .describe(
      'HEADER template id (from list_templates) overriding the site header for this page; null = site default. Ignored when a layout is set.'
    ),
  footerTemplateId: z
    .string()
    .nullable()
    .optional()
    .describe('FOOTER template id (from list_templates); null = site default.'),
  codeLayout: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Kit code-chrome LAYOUT pointer ("codetpl:<kit>/layout") — the coded alternative to layoutId. Mutually exclusive with layoutId.'
    ),
  codeHeader: z
    .string()
    .nullable()
    .optional()
    .describe('Kit code-chrome HEADER pointer ("codetpl:<kit>/header"), the coded alternative to headerTemplateId.'),
  codeFooter: z
    .string()
    .nullable()
    .optional()
    .describe('Kit code-chrome FOOTER pointer ("codetpl:<kit>/footer").'),
  hideHeader: z
    .boolean()
    .optional()
    .describe(
      'Render NO header at all (distinct from null = "use the site default") — for a full-viewport landing page or an auth screen.'
    ),
  hideFooter: z.boolean().optional().describe('Render NO footer at all.'),
  scheduledPublishAt: z
    .string()
    .nullable()
    .optional()
    .describe(
      'ISO timestamp to auto-publish this DRAFT page (null = none). Keep status DRAFT; a scheduler flips it live at that time.'
    ),
  scheduledUnpublishAt: z
    .string()
    .nullable()
    .optional()
    .describe('ISO timestamp to auto-unpublish the page (null = none).'),
  seo: SeoSchema.optional(),
  ...autoResponsiveField,
}

server.tool(
  'list_custom_templates',
  'List the operator-provided custom templates (coded page "kits"). Call before creating a CODE page so you pass a real `component` value ("kit:<id>"). Returns [{ id, name, description }].',
  {},
  () => run(() => api.get('/api/mcp/v1/custom-templates'))
)

server.tool(
  'create_page',
  'Create a page. `content` (optional) is a Puck document validated against the catalog. For a coded page/custom template, pass kind:"CODE" + component (see list_custom_templates) and omit content.',
  {
    title: z.string(),
    path: z
      .string()
      .describe(
        'URL slug for the public page — no leading slash, lowercase, e.g. "about" or "blog/hello". Must be unique. Special routes (home, auth, archives, storefront) are assigned via use_page_as_role / set_storefront_page, not by path.'
      ),
    content: PuckDoc.optional(),
    ...PageMeta,
  },
  (args) => run(() => api.post('/api/mcp/v1/pages', args))
)

server.tool(
  'update_page',
  "Update a page's settings and/or live content.",
  {
    id: z.string(),
    title: z.string().optional(),
    path: z
      .string()
      .optional()
      .describe('URL slug — no leading slash, lowercase (e.g. "about", "blog/hello"). Must stay unique.'),
    content: PuckDoc.optional(),
    ...PageMeta,
  },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/pages/${id}`, body))
)

server.tool(
  'set_page_content',
  "Stage a Puck document as the page's draft (like the builder's autosave). Mobile/tablet responsive is added automatically (see autoResponsive). Publish to make it live.",
  { id: z.string(), content: PuckDoc, seo: SeoSchema.optional(), ...autoResponsiveField },
  ({ id, content, seo, autoResponsive }) =>
    run(() => api.put(`/api/mcp/v1/pages/${id}/content`, { content, seo, autoResponsive }))
)

server.tool(
  'validate_page_content',
  'Check a Puck document against the block catalog WITHOUT writing it — returns `issues` (structural errors that block publish, e.g. unknown block types), `warnings` (non-blocking advisories: external/placeholder image URLs, empty image slots, unknown prop keys, out-of-enum select values, unknown style props), and `changes` (what normalization rewrote — a filled id, a misplaced slot moved into props). The same warnings/changes now ride on create_page/set_page_content/publish_page responses too. Use before publishing.',
  { content: PuckDoc },
  ({ content }) => run(() => api.post('/api/mcp/v1/pages/validate', { content }))
)

server.tool(
  'set_design_brief',
  "Record the design brief for a page BEFORE building — the palette, fonts, icon style, and the design's sections + their asset slots. This is what check_design_coverage compares the built page against, so it is how the MCP catches a missing section, an off-brand CTA, or a substituted image without seeing the render. Pass `brief: null` to clear it.",
  {
    id: z.string(),
    brief: DesignBrief.nullable(),
  },
  ({ id, brief }) => run(() => api.put(`/api/mcp/v1/pages/${id}/brief`, { brief }))
)

server.tool(
  'check_design_coverage',
  "Report where the built page drifts from its design brief: sections in the brief that aren't built (or out of order), Buttons still on the theme colour when the brief wants another, emoji icons when the brief wants real ones, placeholder/external images, and colours outside the palette. Inspects the DRAFT if present. NOTE: this compares the build against the brief YOU wrote, on structure/palette/asset signals ONLY — it does NOT see the render, so it cannot judge visual layout, spacing, proportion or typography; use render_page for those. Run this after building and fix everything it lists BEFORE publishing.",
  { id: z.string() },
  ({ id }) => run(() => api.get(`/api/mcp/v1/pages/${id}/coverage`))
)

server.tool(
  'get_preview_url',
  "Get a no-login preview URL for a page's DRAFT so you (or the operator) can look at the staged build in a browser before publishing.",
  { id: z.string() },
  ({ id }) => run(() => api.post(`/api/mcp/v1/pages/${id}/preview-token`))
)

server.tool(
  'render_page',
  "Render the page's DRAFT to HTML so you can SEE what you built (you author blind) and compare it against the reference BEFORE publishing. Reuses the /preview render; script bundles are stripped. Returns { url, html }. Read the HTML to check layout/spacing/text that check_design_coverage cannot judge.",
  { id: z.string(), viewport: z.enum(['desktop', 'tablet', 'mobile']).optional() },
  ({ id, viewport }) =>
    run(() => api.get(`/api/mcp/v1/pages/${id}/render${viewport ? `?viewport=${viewport}` : ''}`))
)

const PatchOps = z
  .array(
    z.object({
      op: z.enum(['update_props', 'update_style', 'insert', 'move', 'remove']),
      id: z.string().optional(),
      props: z.record(z.any()).optional(),
      block: z.record(z.any()).optional(),
      parentId: z.string().optional(),
      slot: z.string().optional(),
      index: z.number().optional(),
    })
  )
  .describe('Block-addressed edit operations, applied in order (best-effort).')

server.tool(
  'patch_page_content',
  "Edit the DRAFT by BLOCK — address blocks by their stable props.id and apply a small diff instead of re-sending the whole tree (re-sending from memory is why revisions drift). ops (one or many): { op:'update_props', id, props } / { op:'update_style', id, props } merge props into #id; { op:'insert', block, parentId?, slot?, index? } adds a block into parentId.slot (default the document root's content); { op:'move', id, parentId?, slot?, index? } relocates #id; { op:'remove', id }. Applied in order, best-effort; returns applied[] + opErrors[]. Get block ids from get_page or render_page.",
  { id: z.string(), ops: PatchOps },
  ({ id, ops }) => run(() => api.put(`/api/mcp/v1/pages/${id}/content/patch`, { ops }))
)

server.tool(
  'publish_page',
  'Publish a page: promotes the staged draft, or the explicit `content` if given (auto-made-responsive, see autoResponsive).',
  {
    id: z.string(),
    content: PuckDoc.optional(),
    seo: SeoSchema.optional(),
    ...autoResponsiveField,
  },
  ({ id, ...body }) => run(() => api.post(`/api/mcp/v1/pages/${id}/publish`, body))
)

server.tool(
  'discard_draft',
  "Discard a page's staged draft (from set_page_content), reverting the editor to the live design.",
  { id: z.string() },
  ({ id }) => run(() => api.post(`/api/mcp/v1/pages/${id}/discard-draft`))
)

server.tool(
  'delete_page',
  'Move a page to Trash (reversible soft-delete). Prefer this over overwriting an existing page when you want a clean slate.',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/pages/${id}`))
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

// ── Menus (reusable navigation menu manager) ─────────────────────────────────

const MenuItemNode: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: z.string().optional().describe('Existing item id to update; omit for a new item.'),
    label: z.string(),
    type: z.enum(['page', 'url']).optional().describe('Default "url".'),
    pageId: z
      .string()
      .nullable()
      .optional()
      .describe('For type "page": an existing page id (from list_pages).'),
    url: z
      .string()
      .nullable()
      .optional()
      .describe('For type "url": an href, e.g. "/about" or "https://example.com".'),
    target: z.enum(['_self', '_blank']).optional(),
    openMode: z
      .enum(['link', 'mega'])
      .optional()
      .describe('"mega" opens a popup panel built from this item\'s children.'),
    children: z.array(MenuItemNode).optional(),
  })
)

server.tool('list_menus', 'List reusable navigation menus (the Menu Manager).', {}, () =>
  run(() => api.get('/api/mcp/v1/menus'))
)

server.tool('get_menu', 'Get one menu with its full nested item tree.', { id: z.string() }, ({ id }) =>
  run(() => api.get(`/api/mcp/v1/menus/${id}`))
)

server.tool(
  'create_menu',
  'Create a reusable navigation menu. `handle` is the key a MenuBar block binds to (derived from the name if omitted).',
  { name: z.string(), handle: z.string().optional() },
  (args) => run(() => api.post('/api/mcp/v1/menus', args))
)

server.tool(
  'set_menu_items',
  "Replace a menu's WHOLE item tree. Submit items nested (each may carry `children`); array order is display order. Then render the menu by adding a MenuBar block (menuHandle = the menu's handle) to a HEADER/FOOTER template.",
  { id: z.string(), items: z.array(MenuItemNode) },
  ({ id, items }) => run(() => api.put(`/api/mcp/v1/menus/${id}/items`, { items }))
)

// ── Appearance + site config ───────────────────────────────────────────────────

server.tool(
  'get_appearance',
  "Read the current public theme AND the EFFECTIVE colours a block renders with. `effective.primary` is what a Button variant:\"primary\", product CTAs, FormButton and cart/checkout render as — the default is purple #5225e6 on an un-themed site. Call this (or read `theme` in get_block_catalog) BEFORE composing so you can match a design's palette with set_appearance instead of shipping the default.",
  {},
  () => run(() => api.get('/api/mcp/v1/appearance'))
)

server.tool(
  'set_appearance',
  "Set the public theme: font, primary/secondary colours, and named saved-colour variables. Only the fields you pass are changed. Match a design's brand palette here FIRST — Button variant:\"primary\"/\"secondary\", product CTAs, FormButton and cart/checkout all render the theme colours. Values are validated: an unusable colour/font is rejected with 422 + issues (not silently ignored). Responds with the sanitised theme that will actually render.",
  {
    fontFamily: z
      .string()
      .optional()
      .describe('Active font name: a Google family (with fontCssUrl) OR fontCustomName to activate an uploaded font. Letters/digits/spaces/_/- only.'),
    fontCssUrl: z
      .string()
      .optional()
      .describe('A https://fonts.googleapis.com/css2?family=… stylesheet href; fontFamily must be that family name.'),
    fontFaceUrl: z
      .string()
      .optional()
      .describe('Same-origin .woff2/.woff/.ttf/.otf path from upload_media; set fontFamily to fontCustomName to activate it.'),
    fontCustomName: z
      .string()
      .optional()
      .describe('Display name of the uploaded custom font (the @font-face family).'),
    primaryColor: z
      .string()
      .optional()
      .describe("Brand primary/CTA colour. Hex (#3a4a3e), rgb()/hsl()/oklch(), or a CSS keyword. Use the design's colour verbatim."),
    secondaryColor: z.string().optional().describe('Brand secondary colour. Same formats as primaryColor.'),
    savedColors: z
      .array(z.object({ slug: z.string(), name: z.string(), value: z.string() }))
      .optional()
      .describe("Named colour variables (bg, ink, accent, surface, …), published as var(--color-<slug>) — reference them in any block's bg/textColor/borderColor."),
  },
  (args) => run(() => api.put('/api/mcp/v1/appearance', args))
)

server.tool(
  'set_global_code',
  'Replace the site-wide custom code snippets injected on EVERY page (CSS into one <style>, each JS snippet a <script>). For code that belongs to ONE page, put it on that page document instead (see the PuckDoc root note), not here.',
  {
    snippets: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().optional(),
          lang: z.enum(['css', 'js']),
          code: z.string(),
          enabled: z.boolean().optional(),
        })
      )
      .describe(
        'The FULL replacement list (this overwrites the set — include existing snippets you want to keep). Each: { id (any unique string), name?, lang: "css"|"js", code, enabled? }. JS here runs on every page, so keep it tiny — it costs load time on every visit and is a security surface.'
      ),
  },
  ({ snippets }) => run(() => api.put('/api/mcp/v1/global-code', { snippets }))
)

server.tool(
  'set_breakpoints',
  'Replace the site-wide responsive breakpoint tiers (Webflow-style). Affects the @media CSS baked into every page. You rarely need this — auto-responsive already handles phones/tablets.',
  {
    breakpoints: z
      .array(z.object({ id: z.string(), label: z.string(), maxWidth: z.number().nullable() }))
      .describe(
        'The FULL replacement tier list. Each: { id, label, maxWidth } — the WIDEST tier has maxWidth:null (the base/desktop layer); narrower tiers set a pixel max (default tablet 768, mobile 390). Changing tiers rebakes the @media CSS on every page.'
      ),
  },
  ({ breakpoints }) => run(() => api.put('/api/mcp/v1/breakpoints', { breakpoints }))
)
server.tool(
  'use_page_as_role',
  'Assign a PUBLISHED builder page to a site page-role slot ("use as page"): the home front page, the sign-in/sign-up/forgot/reset auth screens, the 404/500 error screens, and the content category/tag archives. pageId:"" clears the slot back to the built-in screen. The page must be PUBLISHED and a builder page, else it is rejected. For a `categoryArchive`/`tagArchive` page, put a Collection List bound to the `posts` collection on it — it auto-lists that category/tag.',
  {
    role: z.enum([
      'home',
      'login',
      'register',
      'forgotPassword',
      'resetPassword',
      'notFound',
      'serverError',
      'categoryArchive',
      'tagArchive',
    ]),
    pageId: z.string().describe('The builder page id to assign, or "" to reset to the built-in screen.'),
  },
  (args) => run(() => api.put('/api/mcp/v1/page-roles', args))
)

// ── Media ──────────────────────────────────────────────────────────────────────

server.tool(
  'list_media',
  'List already-uploaded media (images/files) — reuse an existing `url` instead of re-uploading. Filter by `origin` to find e.g. a design `reference` you uploaded or `placeholder` slots still needing real assets.',
  {
    page: z.number().optional(),
    pageSize: z.number().optional(),
    search: z.string().optional(),
    origin: z
      .enum(['upload', 'url', 'crop', 'reference', 'placeholder'])
      .optional()
      .describe('Filter by provenance.'),
  },
  ({ page, pageSize, search, origin }) =>
    run(() => api.get('/api/mcp/v1/media', { page, pageSize, search, origin }))
)

server.tool(
  'upload_media',
  "Upload an image/file from a local path or a URL — the returned `url` is what you put in image blocks / product images. NEVER upload random stock or placeholder photos (picsum, loremflickr, unsplash-source, placehold.co, …) as brand/hero/product imagery — those hosts are rejected unless you pass purpose:\"placeholder\". To reuse a design's OWN photos, upload the reference image with purpose:\"reference\" then cut regions out with crop_media.",
  {
    path: z.string().optional().describe('A local file path (server-side).'),
    url: z.string().optional().describe('A remote image URL to fetch and self-host.'),
    purpose: z
      .enum(['reference', 'brand', 'placeholder'])
      .optional()
      .describe('reference = a design mockup to crop from; brand = a real asset; placeholder = a labelled stand-in (the ONLY way to accept a placeholder-service URL).'),
    alt: z.string().optional(),
    title: z.string().optional(),
  },
  ({ path, url, purpose, alt, title }) => run(() => uploadMedia({ path, url, purpose, alt, title }))
)

server.tool(
  'crop_media',
  "Cut a rectangle out of an EXISTING image into a new first-party asset — the way to reuse a design reference's own photos (hero, thumbnail, product shots) instead of substituting stock. Coordinates are pixels in the source image's intrinsic resolution (list_media / upload_media report its width & height); the rectangle must sit inside it. Returns the new media record (use its `url`).",
  {
    mediaId: z.string().describe('The source media id (e.g. the uploaded reference).'),
    x: z.number().describe('Left edge, px from the source image left.'),
    y: z.number().describe('Top edge, px from the source image top.'),
    width: z.number().describe('Crop width in px.'),
    height: z.number().describe('Crop height in px.'),
    targetWidth: z.number().optional().describe('Optionally downscale the crop to this width.'),
    alt: z.string().optional(),
    title: z.string().optional(),
  },
  ({ mediaId, x, y, width, height, targetWidth, alt, title }) =>
    run(() =>
      api.post(`/api/mcp/v1/media/${mediaId}/crop`, { x, y, width, height, targetWidth, alt, title })
    )
)

server.tool(
  'update_media',
  'Set the alt text / title / description on an existing media asset.',
  {
    id: z.string(),
    alt: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  },
  ({ id, alt, title, description }) =>
    run(() => api.patch(`/api/mcp/v1/media/${id}`, { alt, title, description }))
)

// ── Commerce (products / variants / categories) ────────────────────────────────
// All require the `ecommerce` module to be enabled (else the builder-API 404s).
// These are the RIGHT way to build a store: create_product renders through the
// `ProductList` block — do NOT fake products with a CMS collection.
const ImageInput = z.object({
  mediaUrl: z.string().describe('Asset URL — get one from upload_media / list_media'),
  alt: z.string().nullable().optional(),
})
const productOptional = {
  subtitle: z.string().nullable().optional(),
  description: z.record(z.any()).optional().describe('Rich-text/TipTap JSON; usually omit'),
  status: z
    .enum(['draft', 'active', 'archived'])
    .optional()
    .describe("'active' = publicly visible, 'draft' = hidden. Defaults to 'draft'."),
  type: z.enum(['physical', 'digital']).optional(),
  featured: z
    .boolean()
    .optional()
    .describe('Featured products fill a ProductList with { source: { featured: true } }'),
  categoryIds: z.array(z.string()).optional().describe('Category IDs from list_categories'),
  tagIds: z
    .array(z.string())
    .optional()
    .describe('Product tag IDs from list_product_tags (max 50). Replaces the set on update.'),
  images: z.array(ImageInput).optional(),
  ctaMode: z.enum(['add_to_cart', 'buy_now', 'external']).optional(),
  externalUrl: z.string().nullable().optional(),
  externalLabel: z.string().nullable().optional(),
  options: z
    .array(z.object({ name: z.string(), values: z.array(z.string()) }))
    .optional()
    .describe(
      'Variant option axes (max 3) — e.g. [{ name: "Size", values: ["S","M","L"] }]. Declare them here, then set each variant\'s optionValues to pick a combination.'
    ),
  position: z.number().optional(),
}
const variantOptional = {
  sku: z.string().nullable().optional(),
  compareAtAmount: z
    .number()
    .nullable()
    .optional()
    .describe('Was-price / strike-through, in minor units'),
  stockOnHand: z.number().optional(),
  optionValues: z.record(z.string()).optional().describe("e.g. { Size: 'L', Colour: 'Blue' }"),
  trackInventory: z.boolean().optional(),
  allowBackorder: z.boolean().optional(),
  weightGrams: z.number().nullable().optional().describe('Shipping weight in grams'),
  imageUrl: z.string().nullable().optional(),
  position: z.number().optional().describe("Sort order among the product's variants"),
}
const categoryOptional = {
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  position: z.number().optional(),
}

server.tool(
  'list_products',
  'List store products (needs the ecommerce module). Filter by status/category/search.',
  {
    search: z.string().optional(),
    status: z.enum(['draft', 'active', 'archived', 'all']).optional(),
    categoryId: z.string().optional(),
    page: z.number().optional(),
    pageSize: z.number().optional(),
  },
  (args) => run(() => api.get('/api/mcp/v1/products', args))
)

server.tool(
  'get_product',
  'Get one product by id, including its variants, images and categories.',
  { id: z.string() },
  ({ id }) => run(() => api.get(`/api/mcp/v1/products/${id}`))
)

server.tool(
  'create_product',
  "Create a store product (needs the ecommerce module). This is how you add products a `ProductList` block renders — do NOT fake products with a CMS collection. A product needs at least one variant to have a price: pass `price` (in MINOR units, e.g. 4900 = $49.00) and this auto-creates a sellable 'Default' variant (with optional `stock`); for size/colour options, omit `price` and call add_variant instead. Set status:'active' to make it publicly visible. Get image URLs from upload_media.",
  {
    title: z.string(),
    price: z
      .number()
      .optional()
      .describe('Minor units (4900 = $49.00). Auto-creates a "Default" variant.'),
    stock: z
      .number()
      .optional()
      .describe(
        'On-hand quantity for the auto "Default" variant; omit to sell it as always-available (untracked)'
      ),
    compareAtPrice: z
      .number()
      .optional()
      .describe(
        'Original "was" price in minor units, ABOVE `price` — shows a strike-through sale price on the card.'
      ),
    ...productOptional,
  },
  (args) => run(() => api.post('/api/mcp/v1/products', args))
)

server.tool(
  'update_product',
  'Update a product (title, status, featured, categories, images, …). Only pass fields you want to change.',
  { id: z.string(), title: z.string().optional(), ...productOptional },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/products/${id}`, body))
)

server.tool(
  'delete_product',
  'Delete (archive) a product. Soft delete — orders that reference it are preserved.',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/products/${id}`))
)

server.tool(
  'add_variant',
  'Add a purchasable variant (a specific size/colour/price) to a product. `priceAmount` is in minor units (4900 = $49.00).',
  { productId: z.string(), title: z.string(), priceAmount: z.number(), ...variantOptional },
  ({ productId, ...body }) =>
    run(() => api.post(`/api/mcp/v1/products/${productId}/variants`, body))
)

server.tool(
  'update_variant',
  'Update a variant (price, stock, options, …). Only pass fields you want to change.',
  {
    variantId: z.string(),
    title: z.string().optional(),
    priceAmount: z.number().optional(),
    ...variantOptional,
  },
  ({ variantId, ...body }) => run(() => api.put(`/api/mcp/v1/variants/${variantId}`, body))
)

server.tool(
  'delete_variant',
  'Delete a variant. A product must keep at least one variant — deleting the last is refused.',
  { variantId: z.string() },
  ({ variantId }) => run(() => api.del(`/api/mcp/v1/variants/${variantId}`))
)

server.tool('list_categories', 'List product categories (needs the ecommerce module).', {}, () =>
  run(() => api.get('/api/mcp/v1/categories'))
)

server.tool(
  'create_category',
  'Create a product category. Assign products to it with create_product/update_product `categoryIds` (the category id). The response returns the category `slug` — use it verbatim as a ProductList `source.categorySlug` to show only that category; pass `slug` explicitly if you already know the value you will filter by.',
  { name: z.string(), ...categoryOptional },
  (args) => run(() => api.post('/api/mcp/v1/categories', args))
)

server.tool(
  'update_category',
  'Update a category. Only pass fields you want to change.',
  { id: z.string(), name: z.string().optional(), ...categoryOptional },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/categories/${id}`, body))
)

server.tool(
  'delete_category',
  'Delete a category. Products are detached from it (not deleted).',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/categories/${id}`))
)

// ── Product tags ───────────────────────────────────────────────────────────────
// Store product tags (distinct from CONTENT tags — see create_content_tag).
const productTagOptional = {
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  position: z.number().optional(),
}

server.tool(
  'list_product_tags',
  'List store product tags (needs the ecommerce module). Assign them to products with create_product/update_product `tagIds`.',
  {},
  () => run(() => api.get('/api/mcp/v1/product-tags'))
)

server.tool(
  'create_product_tag',
  "Create a store product tag. Assign products to it with create_product/update_product `tagIds` (the tag id). The response returns the tag `slug` — use it as a ProductList `source.tagSlug` (or a storefront /tag/<slug> archive) to show only that tag.",
  { name: z.string(), ...productTagOptional },
  (args) => run(() => api.post('/api/mcp/v1/product-tags', args))
)

server.tool(
  'update_product_tag',
  'Update a store product tag. Only pass fields you want to change.',
  { id: z.string(), name: z.string().optional(), ...productTagOptional },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/product-tags/${id}`, body))
)

server.tool(
  'delete_product_tag',
  'Delete a store product tag. Products are detached from it (not deleted).',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/product-tags/${id}`))
)
server.tool(
  'set_storefront_page',
  'Assign a PUBLISHED builder page to an e-commerce storefront screen: the shop front (`shop`), the product-detail template (`product`), cart/checkout/order status, account/login/register, and the category/tag archives (`/shop/category|tag/:slug`). pageId:"" clears the slot back to the built-in screen. The page must be PUBLISHED + a builder page. Requires the ecommerce module enabled. For a `category`/`tag` archive, drop a ProductList block on the page — it auto-lists that taxonomy.',
  {
    slot: z.enum([
      'shop',
      'product',
      'cart',
      'checkout',
      'order',
      'account',
      'login',
      'register',
      'category',
      'tag',
    ]),
    pageId: z.string().describe('The builder page id, or "" to reset to the built-in screen.'),
  },
  (args) => run(() => api.put('/api/mcp/v1/storefront-pages', args))
)

// ── Content (blog/news posts + their categories & tags) ─────────────────────────
// Posts are a first-class core entity (NOT a CMS collection and NOT products).
const contentOptional = {
  status: z
    .enum(['DRAFT', 'PUBLISHED'])
    .optional()
    .describe("'PUBLISHED' = publicly listed, 'DRAFT' = hidden. Defaults to DRAFT on create."),
  visibility: z
    .enum(['PUBLIC', 'PROTECTED', 'MEMBER'])
    .optional()
    .describe(
      'Who may read a PUBLISHED post: PUBLIC (anyone), PROTECTED (needs `password`), MEMBER (signed-in members). Defaults to PUBLIC.'
    ),
  password: z
    .string()
    .nullable()
    .optional()
    .describe('Plaintext gate password — REQUIRED when visibility is PROTECTED; stored encrypted.'),
  featuredImage: z
    .string()
    .nullable()
    .optional()
    .describe('Featured image asset URL (from upload_media / list_media).'),
  data: z
    .record(z.any())
    .nullable()
    .optional()
    .describe('Custom fields defined by the Content-type collection; coerced + filtered server-side.'),
  categoryIds: z
    .array(z.string())
    .optional()
    .describe('Content category IDs from list_content_categories. Replaces the set on update.'),
  tagIds: z
    .array(z.string())
    .optional()
    .describe('Content tag IDs from list_content_tags. Replaces the set on update.'),
}

server.tool('list_content', 'List content posts (blog/news).', {}, () =>
  run(() => api.get('/api/mcp/v1/content'))
)

server.tool('get_content', 'Get one content post by id.', { id: z.string() }, ({ id }) =>
  run(() => api.get(`/api/mcp/v1/content/${id}`))
)

server.tool(
  'create_content',
  'Create a content post (blog/news). `body` is HTML (sanitised server-side). Set status:"PUBLISHED" to make it public. For a members-only or password-gated post set `visibility` (and `password` for PROTECTED).',
  { title: z.string(), slug: z.string(), body: z.string(), ...contentOptional },
  (args) => run(() => api.post('/api/mcp/v1/content', args))
)

server.tool(
  'update_content',
  'Update a content post. Only pass fields you want to change.',
  {
    id: z.string(),
    title: z.string().optional(),
    slug: z.string().optional(),
    body: z.string().optional(),
    ...contentOptional,
  },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/content/${id}`, body))
)

server.tool(
  'delete_content',
  'Delete (trash) a content post.',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/content/${id}`))
)

const contentTaxonomyOptional = {
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
}

server.tool('list_content_categories', 'List content (post) categories.', {}, () =>
  run(() => api.get('/api/mcp/v1/content-categories'))
)

server.tool(
  'create_content_category',
  'Create a content (post) category. Assign posts with create_content/update_content `categoryIds`.',
  { name: z.string(), parentId: z.string().nullable().optional(), ...contentTaxonomyOptional },
  (args) => run(() => api.post('/api/mcp/v1/content-categories', args))
)

server.tool(
  'update_content_category',
  'Update a content category. Only pass fields you want to change.',
  {
    id: z.string(),
    name: z.string().optional(),
    parentId: z.string().nullable().optional(),
    ...contentTaxonomyOptional,
  },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/content-categories/${id}`, body))
)

server.tool(
  'delete_content_category',
  'Delete a content category. Posts are detached from it (not deleted).',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/content-categories/${id}`))
)

server.tool('list_content_tags', 'List content (post) tags.', {}, () =>
  run(() => api.get('/api/mcp/v1/content-tags'))
)

server.tool(
  'create_content_tag',
  'Create a content (post) tag. Assign posts with create_content/update_content `tagIds`.',
  { name: z.string(), ...contentTaxonomyOptional },
  (args) => run(() => api.post('/api/mcp/v1/content-tags', args))
)

server.tool(
  'update_content_tag',
  'Update a content tag. Only pass fields you want to change.',
  { id: z.string(), name: z.string().optional(), ...contentTaxonomyOptional },
  ({ id, ...body }) => run(() => api.put(`/api/mcp/v1/content-tags/${id}`, body))
)

server.tool(
  'delete_content_tag',
  'Delete a content tag. Posts are detached from it (not deleted).',
  { id: z.string() },
  ({ id }) => run(() => api.del(`/api/mcp/v1/content-tags/${id}`))
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
