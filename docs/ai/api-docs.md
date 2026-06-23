# API Docs — auto-generated OpenAPI via adonis-autoswagger + Scalar

**Status:** FOUNDATION + SWAP DONE (2026-06-22). `adonis-autoswagger@3.73.0` installed (devDependency),
`config/swagger.ts` added, and dev-only `/api/openapi` (spec) + `/api/docs` (Scalar UI) routes wired in
[start/routes.ts](../../start/routes.ts). `npm run typecheck` is green and runtime spec generation was
verified out-of-band (73 `/api/*` path entries, a 2723-line spec, Scalar HTML renders). **Not yet
verified in a live browser:** the user must **restart the dev server** (a provider + an uninstalled
package changed, so HMR alone will not pick it up) and open `/api/docs` — see [Verification](#verification).
Per-endpoint JSDoc `@`-annotations in controllers are added separately, incrementally.

Auto-generate an OpenAPI 3.0 spec from the registered routes + Lucid models, and serve it through a
Scalar UI at `/api/docs`. **Dev-only** (no production exposure). Covers all `/api/*` endpoints (admin +
public); non-API routes (Inertia pages, auth HTML, OAuth, SEO, catch-all) are excluded.

See [architecture.md](./architecture.md) for the Inertia-vs-API split and [backend.md](./backend.md) for
controller/route conventions.

## Why adonis-autoswagger (we moved off Tuyau)

We first tried `@tuyau/openapi`, but it reads only the **legacy** Tuyau registry layout (it expects
`.adonisjs/api.ts` exposing `$get`/`$post` per endpoint). The installed `@tuyau/core@1.2.2` emits the
**new** `$tree` registry to `.adonisjs/client/registry/` — there is no `.adonisjs/api.ts` — so the
generator threw and Scalar showed "Document could not be loaded". `@tuyau/openapi@1.0.2` is the latest
release and no shim made the spec non-empty, so it was a dead end and was removed entirely.

`@tuyau/core@1.2.2` itself **stays** — it still powers the typed FE client ([inertia/client.ts](../../inertia/client.ts)).
Only the OpenAPI add-on was swapped out. `adonis-autoswagger@3.73.0` is verified working on AdonisJS
7.3.3: it resolves this project's lazy controller handlers (`() => import('#controllers/...')`) via their
`importExpression`, and auto-derives schemas from Lucid models (`app/models/*`) and `app/validators/*`.

## How it works

There is **no provider** and **no boot-time generation**. Two dev-only routes in
[start/routes.ts](../../start/routes.ts) drive everything, wrapped in `if (!app.inProduction) { ... }`:

- **`GET /api/openapi`** — builds the spec on the fly. It takes `router.toJSON()`, filters the routes to
  only those whose pattern starts with `/api/` (excluding `/api/docs` and `/api/openapi`), then returns
  `AutoSwagger.docs(scoped, swagger)`. This route-level filtering is what **scopes the spec to the JSON
  API surface** (it replaces what Tuyau did with an `exclude` regex).
- **`GET /api/docs`** — returns `AutoSwagger.scalar('/api/openapi')`, the Scalar UI pointed at the spec
  route. Scalar loads its assets from a CDN at runtime.

A small `loadAutoSwagger()` helper resolves the autoswagger singleton across CJS/ESM interop (under
NodeNext the instance can land at `mod.default` or `mod.default.default`, so it probes for the one with
`.docs`).

Config lives in [config/swagger.ts](../../config/swagger.ts):

| Key | Purpose |
|-----|---------|
| `path` | App root (with trailing slash); autoswagger reads `app/` to derive model/validator schemas |
| `title` / `version` / `description` | Base OpenAPI `info` (`'Driftless API'`, `'1.0.0'`) |
| `tagIndex` | `2` — groups endpoints by the **2nd path segment**: `/api/admin/...` → "admin", `/api/public/...` → "public", `/api/v1/...` → "v1" |
| `snakeCase` | `true` — snake_cases generated schema keys |
| `ignore` | `['/api/docs', '/api/openapi']` — belt-and-suspenders (the spec route already filters these) |
| `common` | Shared `parameters` / `headers` to inject across operations |
| `securitySchemes` | `cookieAuth` (apiKey/cookie — current first-party session auth) + `bearerAuth` (http/bearer — reserved for the planned external `/api/v1` token API) |

Per-endpoint request/response detail comes from **JSDoc `@`-annotations** in the controller actions
(autoswagger's annotation grammar — `@summary`, `@description`, `@responseBody`, `@requestBody`, etc.).
Routes + auto-derived model schemas appear without any annotation; un-annotated actions get a "MISSING"
warning from autoswagger and sparse operation detail.

## Locked decisions

- **Scope:** document **all `/api/*`** (admin + public). The `/api/openapi` route filters `router.toJSON()`
  to `/api/*`, dropping Inertia page routes, `/admin/*` + `/auth/*` HTML, OAuth, SEO, and the `*`
  catch-all.
- **UI:** **Scalar** (modern, dark/light, built-in playground).
- **Paths:** docs UI at **`/api/docs`**, spec at **`/api/openapi`** (both under `/api/` at the user's
  request).
- **Access:** **dev-only**. The routes live inside `if (!app.inProduction)`, so they are never registered
  in production.
- **Auth surface:** declare `securitySchemes` (`cookieAuth` + `bearerAuth`) now so the future external
  `/api/v1` + token-auth work has a place to land — even though current `/api/*` is session/cookie guarded.

## Dev-only wiring (resolved)

Gating is **route-level**, not provider-level: both `/api/openapi` and `/api/docs` are registered inside
`if (!app.inProduction) { ... }` in [start/routes.ts](../../start/routes.ts). In production the block is
skipped, so the routes simply do not exist (no env-guard middleware needed). There is no provider and no
`adonisrc.ts` change for this feature.

## Implementation phases

### Phase 1 — Install & dev-only wiring — DONE
1. `adonis-autoswagger@3.73.0` installed as a **devDependency**.
2. `config/swagger.ts` added (hand-authored; see the table above).
3. Dev-only `/api/openapi` + `/api/docs` routes added in [start/routes.ts](../../start/routes.ts) inside
   `if (!app.inProduction)`, with the `loadAutoSwagger()` interop helper and the `/api/*` route filter.
4. `npm run typecheck` green; runtime generation verified out-of-band. Live `/api/docs` not yet exercised
   in a browser — see [Verification](#verification).

### Phase 2 — Config (`config/swagger.ts`) — DONE
5. `title: 'Driftless API'`, `version: '1.0.0'`, `description`, `path` = app root.
6. `tagIndex: 2` → endpoints auto-grouped by the 2nd path segment (`admin` / `public` / future `v1`); no
   manual tag list to maintain.
7. `snakeCase: true`, `ignore: ['/api/docs', '/api/openapi']`, `common` placeholders.
8. `securitySchemes`: `cookieAuth` (apiKey/cookie, current session cookie) and `bearerAuth` (http/bearer,
   reserved for the planned external `/api/v1` token API).

### Phase 3 — Endpoint annotation (incremental, highest-value first) — IN PROGRESS (separate)
9. Add JSDoc `@`-annotations (`@summary`, `@responseBody`, `@requestBody`, …) to controller actions,
   highest-value first. Routes + model schemas already appear; annotations fill in operation detail and
   silence autoswagger's "MISSING" warnings.
10. Spot-check representative endpoints (a list w/ pagination, a create w/ validation, a public read) to
    confirm the auto-derived schemas look right; add explicit response/request annotations where they are
    thin.

## Verification

Confirmed here:

- `npm run typecheck` is green with `config/swagger.ts` + the dev-only routes in place.
- Runtime spec generation was proven out-of-band (a throwaway command): **73 `/api/*` path entries**, a
  **2723-line spec**, and the Scalar HTML renders.

Still needs **manual** verification by the user — and it **requires a dev-server restart** (a provider +
an uninstalled package changed since the previous boot, so HMR alone will not pick it up):

- Restart `npm run dev`, then open **`/api/docs`** — Scalar renders, and **`/api/openapi`** returns a
  valid OpenAPI 3.0 document (generated on the fly).
- Spec contains **only** `/api/*` paths — no Inertia/HTML/OAuth/SEO/catch-all routes (validates the
  route-level `/api/*` filter).
- Endpoints are grouped by `tagIndex` (admin / public).
- Production build: the `if (!app.inProduction)` block is skipped → `/api/docs` and `/api/openapi` return
  404 in prod.
- `npm run build` stays green.

## Caveats / trade-offs (documented honestly)

- **Sparse operations out of the box.** Routes + auto model schemas appear, but per-endpoint
  request/response detail needs JSDoc `@`-annotations in controllers; autoswagger prints "MISSING"
  warnings for un-annotated actions.
- **Inline validators are not auto-discovered.** This project's request validators are mostly **inline**
  (`vine.compile()` inside controllers), and autoswagger only auto-discovers validators in
  `app/validators/*.ts`. So request-body schemas are sparse unless validators are extracted there or
  documented via annotations. Enrichment is best done **incrementally, per-endpoint** — especially for the
  future `/api/v1` (few, externally consumed endpoints).
- **OpenAPI version:** autoswagger emits **3.0.0** (Tuyau emitted 3.1.0); Scalar/Swagger handle both.
- **Default security schemes:** autoswagger injects its own defaults (`BearerAuth`/`BasicAuth`/`ApiKeyAuth`)
  alongside the custom `securitySchemes` in `config/swagger.ts`; the custom set may need refining later.
- **CDN dependency:** the `/api/docs` page pulls Scalar assets from a CDN at runtime — the docs page needs
  internet. Does **not** affect the main app or PWA/offline behavior (see
  [offline-and-pwa.md](./offline-and-pwa.md)).
- **Security:** documenting `/api/admin/*` is safe **only because** the UI is dev-only. Before ever
  exposing `/api/docs` in production, add an auth/permission guard on both `/api/docs` and `/api/openapi`.

## Future (out of scope for this plan, but designed for)

- **External `/api/v1` namespace + token auth.** Today every `/api/*` route is session/cookie guarded for
  the first-party FE. To let other apps consume the API, a separate stateless, token-authenticated
  `/api/v1/*` namespace is needed (reusing the existing thin controllers/services). The `bearerAuth`
  scheme in `config/swagger.ts` is the hook for documenting that, and `tagIndex: 2` auto-groups
  `/api/v1/*` under "v1". Tracked in [api-v1.md](./api-v1.md).
