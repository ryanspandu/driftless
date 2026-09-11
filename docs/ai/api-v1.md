# API v1 — external token-authenticated API

**Status:** IMPLEMENTED — backend + hardening DONE + runtime-verified (2026-06-23). Phases 1–4 shipped:
access-tokens `api` guard + `withAccessTokens` on User + `auth_access_tokens` migration; **self-service**
PAT management (no extra permission); admin PAT CRUD (`/api/admin/api-tokens`) + admin UI page (`/admin/settings/api-tokens`);
`/api/v1/content` + `/api/v1/cms/:key/records` token-guarded, layered RBAC ∩ token-ability; **Redis-backed
rate limiting** (`@adonisjs/limiter`, 120 req/min per token) + **env-driven prod CORS allowlist**
(`CORS_ALLOWED_ORIGINS`). Verified by live HTTP: GET+valid token → 200 + data; no/bad token → 401; write
with read-only token → 403 (CSRF exempted for `/api/v1/*`); 121st request/min → **429** with
`Retry-After` + `X-RateLimit-*` headers (Redis store confirmed). **OpenAPI JSDoc annotations** added to the
v1 controllers (summaries, request/response bodies, params) — verified picked up in the generated spec.
`npm run typecheck` green.

> autoswagger annotation gotcha: each method's JSDoc block **must start with `@<actionName>`** (e.g.
> `@index`, `@store`) as its first line, or the block is ignored and a default summary is used.

**Remaining:** the admin PAT **UI** is built but not yet browser-verified (manual preview) — restart the
dev server first.

A versioned, stateless, **token-authenticated** API namespace (`/api/v1/*`) so other apps can consume
Driftless data. The current first-party API (`/api/admin/*`) stays session/cookie guarded and unchanged;
`/api/v1` is a **deliberately curated external contract**, not a 1:1 mirror of the admin API.

Builds on the existing auth + RBAC stack. See [auth-and-permissions.md](./auth-and-permissions.md) for the
session/permission model and [backend.md](./backend.md) for controller/service conventions. The OpenAPI
docs feature ([api-docs.md](./api-docs.md)) already reserves a `bearerAuth` security scheme in
[config/swagger.ts](../../config/swagger.ts) for this work.

## Locked decisions

- **Token issuance:** **Personal Access Tokens (PAT)** minted from the admin UI — admin creates a named
  token (per app), copies the plaintext once, can revoke any time. Designed so OAuth2 client-credentials
  can be added later without a rewrite.
- **Exposure scope (v1):** **Content + CMS records only**, read **and** write. Users, roles, permissions,
  media, pages, templates, settings and modules stay first-party (session-only) and are NOT exposed.
- **Token mechanism:** AdonisJS **access tokens** (`@adonisjs/auth/access_tokens`) — opaque, hashed in DB,
  revocable, with built-in `abilities` (scopes). Chosen over JWT (hard to revoke) and ad-hoc API keys.
- **Layered access (security):** effective access = **intersection** of (a) the token owner's RBAC
  permissions (reuse the existing permission middleware) **and** (b) the token's `abilities`. A leaked
  token is limited to its scope even if the owner is a superadmin.

## Recommended defaults (smaller decisions — flag if you disagree)

- **Token ↔ identity:** a token belongs to the **user who created it** and inherits that user's RBAC. For
  a dedicated machine identity, create a normal user as a "service account" and mint its token.
- **Expiry:** optional per token; default **no expiry but always revocable**.
- **Abilities vocabulary:** reuse the permission grammar — `content:read`, `content:write`, `cms:read`,
  `cms:write`, or `*`. (`write` maps to create/update/delete.)
- **Rate limiting:** `@adonisjs/limiter`, keyed per token. **New dependency — not yet installed.**
- **CORS:** v1 uses the `Authorization` header (no cookies) → CSRF-free; set an explicit prod origin
  allowlist in [config/cors.ts](../../config/cors.ts) (currently empty in prod).

## What already exists (verified 2026-06-22) — reuse, don't rebuild

- **`@adonisjs/auth` ships the access-tokens module** (`access_tokens_guard`, token/user providers). No
  new auth package needed — just configure a guard + add the model mixin.
- **Permission middleware is guard-agnostic** ([require_permission_middleware.ts](../../app/middleware/require_permission_middleware.ts)):
  reads `ctx.auth.user`, loads roles→permissions from DB. Works identically whether the user came from the
  session or a token. **Reused as-is.**
- **Auth middleware** ([auth_middleware.ts](../../app/middleware/auth_middleware.ts)) already returns
  **401 JSON** for `/api/*` and accepts `options.guards` → `middleware.auth({ guards: ['api'] })`.
- **Thin controllers over services** — `ContentService` / CMS services hold the logic, so v1 controllers
  stay thin.
- **Permission grammar + seeder** — CASL-style in [permission_ability_service.ts](../../app/services/permission_ability_service.ts);
  permissions are declared in [database/seeder_constants.ts](../../database/seeder_constants.ts).

## What must be built

- An `api` access-tokens guard + the `withAccessTokens` mixin on the User model + an `auth_access_tokens`
  migration.
- A PAT management surface (admin UI + session-guarded CRUD endpoints; **self-service** — each user manages their own tokens, no extra permission).
- The `/api/v1/*` routes + thin controllers + a token-ability check.
- Rate limiting (`@adonisjs/limiter`), CORS allowlist, and OpenAPI tagging/security for v1.

## Implementation phases (note the sequencing — not all parallelizable)

### Phase 1 — Token foundation (SEQUENTIAL, gates everything)
1. Add `withAccessTokens` mixin to [User model](../../app/models/user.ts) (`tokens = DbAccessTokensProvider.forModel(User)`).
2. Migration `…_create_auth_access_tokens_table.ts` (follow the `<timestamp>_create_*` convention in
   [database/migrations](../../database/migrations)). Run + verify.
3. Add an `api` guard in [config/auth.ts](../../config/auth.ts) via `accessTokensGuard({ provider:
   accessTokensUserProvider(...) })`, alongside the existing `web` guard (keep `default: 'web'`).
4. Typecheck green.

### Phase 2 — PAT management (depends on Phase 1)
5. **Self-service model (decided):** any authenticated admin-area user manages their **own** tokens — no
   `token:manage` permission (a token can't exceed its owner's RBAC, so self-service is safe).
6. `ApiTokensController` (admin): `index` (list — never returns plaintext), `store` (create → returns
   plaintext **once**), `destroy` (revoke). Backed by `User.accessTokens` APIs, scoped to `auth.user`.
7. Routes under `/api/admin/api-tokens`, session-guarded only (no permission middleware). Inertia page
   route `/admin/settings/api-tokens` (under Settings → Developer & API).
8. Admin UI page: create form (name + abilities multiselect + optional expiry), one-time plaintext reveal
   with copy, list with revoke. Follow the admin list-page pattern (see [frontend.md](./frontend.md)).

### Phase 3 — `/api/v1` namespace (depends on Phase 1; parallelizable with Phase 2)
9. Thin controllers in `app/controllers/api/v1/` over the existing services:
   - `ContentController` → `ContentService`
   - `CmsRecordsController` → CMS record service
   Curate the response DTOs as the **stable external contract** (don't leak admin-only fields).
10. Routes:
    ```
    /api/v1/content              GET POST PUT DELETE
    /api/v1/cms/:key/records     GET POST PUT DELETE
    ```
    Each route: `middleware.auth({ guards: ['api'] })` + reuse `middleware.permission(...)` + a token
    `ability` check (e.g. `ctx.auth.user.currentAccessToken.allows('content:write')`). Consider a small
    `require_token_ability` middleware to keep the ability check DRY.
11. Validation via vine (mirror the admin validators where shapes overlap).

### Phase 4 — Hardening + docs (depends on 2 & 3)
12. Rate limiting: install `@adonisjs/limiter`, configure a store, throttle `/api/v1/*` keyed by token id.
13. CORS: populate the prod `origin` allowlist in [config/cors.ts](../../config/cors.ts).
14. OpenAPI: no manual tag wiring needed — `tagIndex: 2` in [config/swagger.ts](../../config/swagger.ts)
    auto-groups `/api/v1/*` under the **"v1"** tag (the 2nd path segment). Add per-endpoint detail and the
    security requirement via JSDoc `@`-annotations on the v1 controller actions (e.g. `@summary` plus a
    `@security bearerAuth` annotation). The `bearerAuth` scheme already exists in `config/swagger.ts`. See
    [api-docs.md](./api-docs.md).
15. Docs: update this file's status, [auth-and-permissions.md](./auth-and-permissions.md) (token guard +
    PAT), [backend.md](./backend.md) (v1 controller/ability conventions), and the
    [README.md](./README.md) index row.

## Verification

- New user can mint a PAT in admin; plaintext shown once; listing never re-exposes it; revoke works.
- `curl -H "Authorization: Bearer <token>" /api/v1/content` returns 200; no/invalid token → 401; valid
  token lacking the ability or RBAC permission → 403.
- A token scoped `content:read` cannot write even if its owner is SUPERADMIN (intersection holds).
- `/api/admin/*` + session flows unchanged (regression check).
- `npm run typecheck` + `npm run build` green; relevant Japa suites pass (see [testing.md](./testing.md)).

## Security notes

- Never log or persist token plaintext; show once on creation only (Adonis returns it once).
- Token abilities are a ceiling, not a grant — RBAC still applies. Keep the intersection check.
- Audit: consider recording `lastUsedAt` (Adonis tracks this) and surfacing it in the admin list.
- Before exposing more resources later, re-evaluate scope per resource — do not blanket-expose admin CRUD.

## Future

- **OAuth2 client-credentials** for third-party machine-to-machine access (PAT covers first-party apps now).
- Widen `/api/v1` surface (e.g. media read) behind explicit abilities once the token model is proven.
- `/api/v2` when the contract must break — versioned namespace makes this clean.
