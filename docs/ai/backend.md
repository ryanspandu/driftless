# Backend

AdonisJS 7 server code lives under `app/`, `start/`, `config/`, and `providers/`.

## Layering

```
Route (start/routes.ts)
  → Middleware (auth, permission, …)
  → Controller (app/controllers/)
  → Service (app/services/)
  → Model (app/models/) + Lucid
```

Keep controllers thin: parse/validate input, call services, return Inertia or JSON.

## Controllers

| Area | Path pattern | Examples |
|------|--------------|----------|
| Public | `app/controllers/public_*.ts`, `seo_controller.ts` | `public_controller`, `public_content_controller`, `seo_controller` (`/robots.txt`, `/sitemap.xml`) |
| Auth | `session_controller`, `new_account_controller`, `google_auth_controller` | Login, register, OAuth |
| Admin pages + API | `app/controllers/admin/*_controller.ts` | `users_controller`, `cms_controller` |

Admin controllers often expose:

- `*Page()` — `renderPage(ctx.inertia, 'admin/...', props)` for Inertia
- `index`, `store`, `update`, `destroy` — JSON under `/api/admin/...`

## Services

Business logic in `app/services/`:

| Service | Responsibility |
|---------|----------------|
| `cms_service` | Collections, fields, records, revisions |
| `cms_permissions_service` | Mints/syncs CMS record permissions |
| `content_service` | Content posts (default `/admin/content` pages) |
| `users_service`, `roles_service`, `permissions_service` | RBAC |
| `settings_service` | Web + integration settings (exports class `IntegrationSettingsService`) |
| `media_service` | File uploads |
| `permission_ability_service` | Permission string matching |
| `captcha_service`, `user_auth_service` | Auth helpers |
| `ulid_service` | ULID generation (`newUlid`) for CMS entities |

## Validation

- VineJS validators in `app/validators/`.
- Register/custom rules in `start/validator.ts` if needed.

## Transformers

- `app/transformers/` — shape Lucid models for Inertia shared props and API (e.g. `user_transformer.ts`).
- Enabled via `indexEntities` in `adonisrc.ts`.

## Middleware

| File | Role |
|------|------|
| `inertia_middleware.ts` | Shared Inertia props |
| `auth_middleware.ts` | Require login |
| `guest_middleware.ts` | Logged-out only |
| `require_permission_middleware.ts` | RBAC on API routes |
| `silent_auth_middleware.ts` | Optional auth hydration |

Permission middleware options: `{ permission: 'role:manage' }`, `{ resource: 'user' \| 'content' \| 'media' }`, `{ cmsRecord: true }` (derives `cms:{key}:{verb}` from route params + HTTP method).

## Providers

- `providers/cms_provider.ts` — on boot, reconciles `NATIVE_COLLECTIONS` into DB. That array is now empty (no native collections), so it currently does nothing; kept for the dynamic-only CMS.
- `providers/api_provider.ts` — API-related bindings.

## Custom commands

- `commands/migrate_from_legacy.ts` — `node ace migrate:from-legacy` (see [LEGACY_MIGRATION.md](../LEGACY_MIGRATION.md)).

## Adding an admin API feature

1. Route in `start/routes.ts` inside `auth()` group with `.use(middleware.permission(...))`.
2. Controller method in `app/controllers/admin/`.
3. Service method if logic is non-trivial.
4. Validator for write operations.
5. Frontend hook in `inertia/hooks/api/` (see [frontend.md](./frontend.md)).

## API documentation (OpenAPI)

`adonis-autoswagger` generates an OpenAPI 3.0 spec on the fly from the registered routes + Lucid models.
**Dev-only** — the `/api/openapi` (spec) and `/api/docs` (Scalar UI) routes live inside an
`if (!app.inProduction) { ... }` block in `start/routes.ts`, so they do not exist in prod.

- In dev (`npm run dev`): browse **`/api/docs`** for the Scalar UI, or **`/api/openapi`** for the raw spec.
- Schemas are **auto-derived from Lucid models (`app/models/*`) and validators in `app/validators/*`** — no
  config per endpoint for those shapes. Note: **inline** `vine.compile()` validators inside controllers are
  not auto-discovered.
- Enrich per-endpoint detail with JSDoc `@`-annotations on controller actions (`@summary`,
  `@responseBody`, `@requestBody`, …); un-annotated actions get a "MISSING" warning and sparse detail.
- Endpoints are grouped by `tagIndex: 2` (the 2nd path segment) in `config/swagger.ts` → `admin` /
  `public` (and future `v1`).
- Only `/api/*` routes are documented — the `/api/openapi` route filters `router.toJSON()` to `/api/*`
  (excluding the doc routes).

Full reference: [api-docs.md](./api-docs.md).

## External API (`/api/v1`)

A versioned, **token-authenticated** surface for other apps — separate from the session-guarded
`/api/admin/*` (which stays first-party). Thin controllers in `app/controllers/api/v1/` reuse the same
services; routes are guarded by `middleware.auth({ guards: ['api'] })` + the reused
`middleware.permission(...)` + `middleware.tokenAbility({ ability })`, so **effective access = RBAC ∩ token
ability**. Bearer access tokens (`@adonisjs/auth/access_tokens`) are minted as Personal Access Tokens at
`/admin/settings/api-tokens`; requests are rate-limited via Redis (`@adonisjs/limiter`). v1 routes
need explicit `.as('v1.*')` names to avoid Tuyau registry clashes. Full reference: [api-v1.md](./api-v1.md).

## Related

- [architecture.md](./architecture.md)
- [auth-and-permissions.md](./auth-and-permissions.md)
- [cms.md](./cms.md)
- [api-docs.md](./api-docs.md)
