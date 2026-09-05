# MCP module

Lets an AI assistant build a **whole Driftless site** — collections + fields,
records, pages (Puck content), templates, appearance and media — over the
[Model Context Protocol](https://modelcontextprotocol.io).

Three pieces ship together:

1. A **builder-API** at `/api/mcp/v1/*` — token-authenticated HTTP, thin
   controllers over the existing core services (which stay the validation
   authority). This is the product surface; anything can call it.
2. An **in-app MCP endpoint** (Streamable HTTP) at `POST /api/mcp/v1/rpc` — a
   remote client connects with a bearer token, no install; each tool forwards to
   the builder-API above. This is the recommended way to connect.
3. A bundled **stdio MCP server** ([`server/`](server/)) — a standalone client
   whose every tool is one call to that API, for stdio-only / offline setups.

An admin page at `/admin/mcp` mints scoped tokens, shows an activity audit, and
has a **Connect** button with copy-ready Claude/Codex config.

> The module is **off by default**. Turn it on with `node ace modules:install mcp`
> (or Settings → Modules). While off, `/api/mcp/v1/*` returns 404.

## Architecture

```
Claude / Codex desktop
      │  stdio (MCP)
      ▼
modules/mcp/server  ──HTTP (Bearer PAT)──▶  /api/mcp/v1/*  ──▶  Cms/Pages/Templates/WebSettings/Media services
      │                                          │
   get_block_catalog ◀───────────────  resources/mcp/catalog.*.json  (emitted by `node ace mcp:catalog`)
```

Effective access on every builder-API route is **token ability ∩ RBAC owner**,
exactly like `/api/v1`: the `tokenAbility` middleware checks the token's
`builder:*` scope, `permission` checks the owner's RBAC. A leaked token is still
bounded by the owner's permissions.

## Enabling + minting a token

```bash
node ace modules:install mcp     # runs the module, no restart needed
```

Mint a personal access token — from the **MCP admin page** (`/admin/mcp`, which
scopes the form to the builder abilities and shows the activity log) or Admin →
Settings → API tokens — with the abilities the work needs:

| Ability                  | Grants                                                       | RBAC also required           |
| ------------------------ | ------------------------------------------------------------ | ---------------------------- |
| `builder:read`           | read catalog, collections, pages, templates, media           | the matching read permission |
| `builder:collections`    | create/update/delete collections + fields                    | `cms:manage`                 |
| `builder:pages`          | create/update/publish pages                                  | `page:*`                     |
| `builder:templates`      | create/update templates                                      | `template:*`                 |
| `builder:settings`       | appearance, breakpoints, global code                         | `settings:manage`            |
| `builder:media`          | upload media                                                 | `media:manage`               |
| `cms:read` / `cms:write` | list/create/update/delete **records** (reuses `/api/v1/cms`) | `cms:<collection>:*`         |

`*` (all abilities) works too. Records deliberately reuse the existing
`/api/v1/cms/:key/records` endpoints rather than being duplicated here.

## Builder-API reference

All paths are under `/api/mcp/v1` unless noted. JSON in, JSON out. Errors are
`4xx` with `{ message }`; content validation failures are `422` with `{ message,
issues }`.

| Method + path                                                                                      | Ability                          | Notes                                     |
| -------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------- |
| `GET /catalog?type=page\|collection\|email`                                                        | `builder:read`                   | machine-readable block catalog            |
| `GET /collections` · `GET /collections/:key`                                                       | `builder:read`                   |                                           |
| `POST /collections` · `PUT /collections/:key` · `DELETE /collections/:key`                         | `builder:collections`            |                                           |
| `POST /collections/:key/fields` · `PUT\|DELETE .../fields/:field` · `PATCH .../fields/reorder`     | `builder:collections`            |                                           |
| `GET /pages` · `GET /pages/:id`                                                                    | `builder:read`                   |                                           |
| `POST /pages` · `PUT /pages/:id`                                                                   | `builder:pages`                  | `content` validated against the catalog   |
| `PUT /pages/:id/content`                                                                           | `builder:pages`                  | stages a draft (like autosave)            |
| `POST /pages/:id/publish`                                                                          | `builder:pages`                  | promotes the draft, or explicit `content` |
| `POST /pages/validate`                                                                             | `builder:read`                   | validate a doc **without** writing        |
| `POST /pages/:id/discard-draft`                                                                    | `builder:pages`                  |                                           |
| `GET /templates` · `GET /templates/:id`                                                            | `builder:read`                   |                                           |
| `POST /templates` · `PUT /templates/:id` · `DELETE /templates/:id` · `POST /templates/:id/default` | `builder:templates`              |                                           |
| `PUT /appearance` · `PUT /breakpoints` · `PUT /global-code`                                        | `builder:settings`               |                                           |
| `GET /media` · `POST /media` (multipart `file`)                                                    | `builder:read` / `builder:media` |                                           |
| `POST /api/v1/cms/:key/records` …                                                                  | `cms:write`                      | records — the existing v1 API             |

## Block catalog + content validation

The Adonis runtime can't import the React Puck config, so the catalog is
**emitted** from it:

```bash
node ace mcp:catalog     # writes resources/mcp/catalog.{page,collection,email}.json
```

It loads `inertia/puck/config.tsx` the way Inertia SSR does (a throwaway Vite
server), walks the block registry, strips the render functions, and records each
block's `type`, `label`, `category`, `fields` (with select `options`), `slots`
(nestable children), shared `styleProps` and `module` (provenance). Wired into
`prebuild`, so builds are always fresh; run it by hand after changing blocks in dev.

The full builder set is included: core blocks (`module: null`) **plus every
module's contributed blocks** — e-commerce's `ProductList`, `CartBlock`, etc. are
tagged `module: "ecommerce"`. A module block only renders while its module is
enabled, so an AI should prefer core blocks unless the site uses that module.
The set is discovered statically (`import.meta.glob` over `modules/*/ui/puck/blocks.tsx`),
so it is deterministic and every module install's rebuild re-emits it.

`services/puck_content_validator.ts` checks a submitted document against that
catalog: every node's `type` must exist, every node gets a stable `props.id`, and
slot props must be arrays of valid nodes. It runs on every page/template write
(422 on failure) and behind `POST /pages/validate`. With no catalog present it
degrades to non-enforcing (ids filled, nothing rejected) so a fresh checkout can
still build.

A Puck document is:

```jsonc
{
  "root": { "props": {} },
  "content": [
    { "type": "Heading", "props": { "text": "Hi", "level": "1" } },
    {
      "type": "Section",
      "props": {
        "content": [
          /* nested blocks in the slot */
        ],
      },
    },
  ],
}
```

Leave `id` out and the API fills it in. **Custom code-blocks defined in the DB
are not in the static catalog** and will be rejected — build those in the UI.

## Connecting an AI client

The fastest path is the **admin page**: `/admin/mcp` → **Connect**. It shows
copy-ready config for Claude and Codex with this site's URL already filled in;
create a token there and paste it in. The rest of this section is the detail
behind that modal. Either connection exposes the same tool set, which maps 1:1
to the API and steers the flow: `get_block_catalog` → `create_collection` /
`add_field` → `create_page` → `set_page_content` → `validate_page_content` →
`publish_page`.

### Option A — Remote (recommended, no install)

The module serves MCP over **Streamable HTTP** at `POST /api/mcp/v1/rpc`. A
client connects with just the URL and a bearer token — nothing to install. The
endpoint is stateless; each tool call forwards internally to the builder-API
carrying your token, so every ability/RBAC guard and the content validator
apply unchanged.

Most desktop clients reach a remote endpoint through **`mcp-remote`** — a tiny
bridge auto-run by `npx` that adds the bearer header (this is what the Connect
modal generates):

```jsonc
// Claude: Settings → Developer → Edit Config (claude_desktop_config.json)
// Codex: ~/.codex/config.toml, as [mcp_servers.driftless] with the same fields
{
  "mcpServers": {
    "driftless": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<host>/api/mcp/v1/rpc",
        "--header",
        "Authorization: Bearer <token>",
      ],
    },
  },
}
```

A client that supports remote MCP with custom headers natively can skip
`mcp-remote` and point at the URL with an `Authorization: Bearer <token>` header
directly. Either way, point it at any Driftless origin (local or deployed) —
same endpoint, no rework.

### Option B — Local stdio bridge

For clients that only speak stdio, or when you'd rather run a local process:

```bash
cd modules/mcp/server
npm install && npm run build      # → dist/index.js
```

```jsonc
// claude_desktop_config.json (Codex: same command / args / env)
{
  "mcpServers": {
    "driftless": {
      "command": "node",
      "args": ["/absolute/path/to/driftless/modules/mcp/server/dist/index.js"],
      "env": {
        "DRIFTLESS_URL": "http://localhost:3333",
        "DRIFTLESS_TOKEN": "pat_xxx",
      },
    },
  },
}
```

Both paths call the exact same builder-API; the tool set is defined once in
`mcp_tools.ts` (in-app) and mirrored by the stdio client.

## Security

- Access is always **token ability ∩ RBAC owner**; a leaked token stays bounded.
- Module is **off by default**; DDL (collections) and publish are gated by
  ability **and** RBAC **and** the structural validator.
- HTML in content still goes through `sanitizePuckDocument`; privileged content
  (CSS/JS snippets) still needs `settings:manage`.
- Media ingest is multipart-only through `MediaService.upload`, which sniffs the
  real file type and rejects unsafe SVGs. The MCP client fetches any source URL
  itself and posts the bytes.
- Rate limit: 120 req/min per token overall (`mcp_builder_api`), mirroring
  `/api/v1`, plus a stricter **write-only** cap of 30 mutations/min per token
  (`mcp_builder_write`, POST/PUT/PATCH/DELETE only) — reads stay unthrottled by
  it, so a leaked token cannot bulk-create/publish/delete on the minute's budget.

## Phase 2

- **In-app Streamable-HTTP transport — done** (see Option A above): stateless
  `POST /api/mcp/v1/rpc`, tools forward to the builder-API with the caller's
  token so all guards apply. Single-process, in-memory; a multi-worker
  deployment behind a load balancer would still need sticky routing or a shared
  session store if stateful sessions are later introduced.

- **Admin UI + audit — done**: `/admin/mcp` mints/revokes builder-scoped tokens
  and shows the activity log. Every **builder-API** call (`/api/mcp/v1/*`,
  including the in-app RPC's forwarded calls and 403 denials) is recorded in
  `mcp_audit_logs` by the `mcpAudit` middleware — method, path, a friendly
  action, status, duration and the calling token.

  > **Records are the exception.** `create_record` / `update_record` /
  > `delete_record` forward to `/api/v1/cms/*` (the shared records API), not the
  > builder-API, so those mutations are **not** in the MCP activity log and are
  > limited by `apiV1Throttle`, not the MCP write throttle. Auditing record
  > writes through the MCP surface is a known follow-up.

- **Module blocks in the catalog — done**: the catalog already carries every
  module's blocks with their field detail, now each tagged with its `module`
  (provenance) so the AI knows a block's origin and that it needs that module
  enabled. See _Block catalog_ above.

- **Stricter write limits — done**: a separate `mcp_builder_write` limiter caps
  mutations (POST/PUT/PATCH/DELETE) at 30/min per token, layered under the
  overall 120/min; reads pass through untouched. See _Security_ above.

Phase 2 is complete. Possible future work: horizontally-scaled stateful RPC
sessions, and richer schemas for complex object fields in the catalog.

## Files

- `module.ts`, `routes.ts`, `throttles.ts` — manifest + `/api/mcp/v1/*` wiring.
- `controllers/api/*` — thin controllers over core services.
- `controllers/mcp_rpc_controller.ts` — the in-app Streamable-HTTP MCP endpoint.
- `controllers/mcp_controller.ts` — the `/admin/mcp` page + token/audit JSON endpoints.
- `mcp_tools.ts` — the transport-agnostic tool definitions (forward to builder-API).
- `services/block_catalog.ts` — loads the emitted catalog.
- `services/puck_content_validator.ts` — structural validation.
- `services/mcp_audit.ts` — the `mcpAudit` middleware + activity-log queries.
- `models/mcp_audit_log.ts` + `migrations/*_create_mcp_audit_logs.ts` — the audit table.
- `ui/admin/` — the admin page (Connect modal, tokens, activity) + its client hooks.
- `../../commands/mcp_catalog.ts` — the catalog emitter (`node ace mcp:catalog`).
- `server/` — the standalone MCP stdio client.
- `../../tests/functional/mcp_builder_api.spec.ts` — builder-API auth/ability/validator/publish.
- `../../tests/functional/mcp_rpc.spec.ts` — in-app RPC handshake, forwarding + guards.
- `../../tests/functional/mcp_admin.spec.ts` — token management + audit logging.
- `../../tests/functional/mcp_throttle.spec.ts` — the stricter write rate limit.
