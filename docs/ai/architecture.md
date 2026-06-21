# Architecture

Driftless is a single **AdonisJS 7** application that serves both server-rendered **Inertia** pages and JSON **API** routes on one process (default port **3333**).

## High-level flow

```
Browser
  ├─ Inertia (React)     → GET /admin/*, /login, /, …
  ├─ fetch /api/admin/*  → TanStack Query hooks (JSON)
  ├─ fetch /api/public/* → public content API
  └─ Dexie + sync        → offline queue when enabled
        ↓
Adonis HTTP (start/routes.ts)
  → middleware stack
  → controller
  → service
  → Lucid model
  → PostgreSQL
```

## Directory roles

| Path | Role |
|------|------|
| `app/controllers/` | HTTP handlers; `admin/*` for back office |
| `app/services/` | Business logic; keep controllers thin |
| `app/models/` | Lucid ORM models |
| `app/middleware/` | Auth, permissions, Inertia shared props |
| `app/validators/` | VineJS request validation |
| `app/transformers/` | Shape models for Inertia/API responses |
| `app/cms/` | CMS native registry (`native_registry.ts`, now empty — CMS is dynamic-only) |
| `providers/` | `cms_provider`, `api_provider` boot logic |
| `start/routes.ts` | All route definitions |
| `start/kernel.ts` | Global and router middleware |
| `config/` | Auth, database, vite, inertia, etc. |
| `inertia/` | React app: pages, components, hooks, lib |
| `database/` | Migrations and seeders |
| `commands/` | Ace commands (e.g. `migrate:from-legacy`) |
| `.adonisjs/` | Generated Tuyau/Inertia registry (do not hand-edit) |

## Middleware order

From `start/kernel.ts`:

**Server (all requests):**

1. `container_bindings_middleware`
2. `@adonisjs/static`
3. `@adonisjs/cors`
4. `@adonisjs/vite`
5. `inertia_middleware` (shared props: `user`, `permissions`, `flash`, `errors`)

**Router (matched routes):**

1. Bodyparser
2. Session
3. Shield (CSRF)
4. Auth initialize
5. `silent_auth_middleware`

**Named (per route group):**

- `guest` — login/signup only
- `auth` — requires logged-in user
- `permission` — checks role permission codes

## Inertia

- Entry: `inertia/app.tsx` (Vite entrypoint).
- Pages: `inertia/pages/${name}.tsx` (e.g. `admin/dashboard` → `inertia/pages/admin/dashboard.tsx`).
- Render helper: `app/helpers/inertia_render.ts` (`renderPage`).
- Shared data: `app/middleware/inertia_middleware.ts` loads user roles/permissions on each Inertia request.

## Route patterns

| Pattern | Example | Purpose |
|---------|---------|---------|
| Inertia page | `GET /admin/users` | Full-page React via Inertia |
| Admin JSON API | `GET /api/admin/users` | Client-side data (React Query) |
| Public API | `GET /api/public/content` | Headless/public consumers |
| Auth | `POST /login`, `GET /auth/google` | Session + OAuth |

Admin routes live under one `auth()` group in `start/routes.ts`. JSON routes are grouped with `.use(middleware.permission(...))`.

## Generated client (Tuyau)

`adonisrc.ts` hooks run `generateRegistry()` and `indexPages()`. Output under `.adonisjs/client/` and `inertia/client`. Regenerate via normal Adonis dev/build; do not manually edit generated files.

## Related

- [backend.md](./backend.md)
- [frontend.md](./frontend.md)
- [auth-and-permissions.md](./auth-and-permissions.md)
