# Driftless — AI agent guide

**Driftless** is an AdonisJS 7 monolith with Inertia + React admin UI, dynamic CMS, RBAC, and optional offline/PWA.

**Node:** ≥ 24 · **Default port:** 3333 · **DB:** PostgreSQL (`localhost:5433` via Docker)

## Quick start

```bash
docker compose up -d
cp .env.example .env   # set APP_KEY, DATABASE_URL
node ace migration:run && node ace db:seed
npm install
npm run dev            # NOT plain `node ace serve`
```

## Repo map

| Directory | Purpose |
|-----------|---------|
| `app/controllers/` | HTTP handlers (admin + public) |
| `app/services/` | Business logic |
| `app/models/` | Lucid models |
| `app/middleware/` | Auth, permissions, Inertia |
| `app/validators/` | VineJS validation |
| `app/cms/` | Native CMS registry |
| `start/` | Routes, kernel, env |
| `config/` | Adonis config |
| `inertia/` | React pages, components, hooks |
| `database/` | Migrations, seeders |
| `commands/` | Ace commands |
| `tests/` | Japa unit / functional / browser |
| `docs/ai/` | Deep reference for agents |
| `docs/LEGACY_MIGRATION.md` | Legacy stack migration only |

## Stack (short)

| Layer | Tech |
|-------|------|
| Server | AdonisJS 7, Lucid, VineJS, session auth |
| Client | Inertia 4, React 19, Vite 7, Tailwind 4 |
| Data | PostgreSQL 16 |
| CMS | Dynamic collections + native registry, ULIDs, revisions |
| Client data | TanStack Query → `/api/admin/*` |
| Offline | Dexie + Serwist (optional) |
| Tests | Japa |

## Do / don't (agents)

**Do**

- Use `npm run dev` for local development.
- Point `DATABASE_URL` at the **driftless** database.
- Quote `SEED_ADMIN_PASSWORD` in `.env` if it contains `#`.
- Keep controllers thin; put logic in `app/services/`.
- Add permission middleware on new admin API routes.
- Run `npm run typecheck` after substantive TS changes.

**Don't**

- Commit `.env` or secrets.
- Run migrations against the legacy stack database.
- Hand-edit `.adonisjs/client/` or generated registry files.
- Use `node ace serve` alone for UI work (no Vite HMR).
- Create git commits or PRs unless the user asks.

## Vite manifest in dev (handled automatically)

The error *"Cannot read the manifest file when running in dev mode"* — caused by a stale `public/assets/.vite/manifest.json` left by a prior `npm run build` while the Vite dev server is active — is now prevented automatically:

- `predev` / `preserve` run `scripts/clean-vite-dev.mjs` to delete the stale manifest before dev starts.
- `providers/vite_dev_provider.ts` sets `vite.hasManifestFile = false` in dev and starts the Vite dev server when there is no manifest (covers plain `node ace serve` as well as `npm run dev`). Production (`npm start`) still requires `npm run build`.

Manual clear if ever needed: `node scripts/clean-vite-dev.mjs`.

## Adding a feature (checklist)

1. **Route** — `start/routes.ts` (+ `middleware.auth()` / `middleware.permission()`).
2. **Controller** — `app/controllers/admin/...` (page + API methods).
3. **Service** — `app/services/...` if non-trivial.
4. **Validator** — `app/validators/...` for writes.
5. **Model / migration** — if schema changes.
6. **Frontend** — `inertia/pages/...` and/or `inertia/hooks/api/...`.
7. **Permissions** — server middleware + client `permissions` / `~/lib/ability`.

## Documentation index

| Doc | Topics |
|-----|--------|
| [docs/ai/README.md](docs/ai/README.md) | Full index |
| [docs/ai/architecture.md](docs/ai/architecture.md) | Request flow, middleware |
| [docs/ai/dev-workflow.md](docs/ai/dev-workflow.md) | Commands, env, Docker |
| [docs/ai/backend.md](docs/ai/backend.md) | Controllers, services |
| [docs/ai/frontend.md](docs/ai/frontend.md) | Inertia, React, UI |
| [docs/ai/cms.md](docs/ai/cms.md) | Collections, records |
| [docs/ai/auth-and-permissions.md](docs/ai/auth-and-permissions.md) | Auth, RBAC |
| [docs/ai/offline-and-pwa.md](docs/ai/offline-and-pwa.md) | Dexie, Serwist |
| [docs/ai/testing.md](docs/ai/testing.md) | Japa |
| [docs/ai/conventions.md](docs/ai/conventions.md) | Style, maintenance |
| [docs/LEGACY_MIGRATION.md](docs/LEGACY_MIGRATION.md) | Legacy stack migration |

## Tool entry points

| Tool | File |
|------|------|
| Claude Code | [CLAUDE.md](CLAUDE.md) |
| GitHub Copilot | [.github/copilot-instructions.md](.github/copilot-instructions.md) |
| Cursor | [.cursor/rules/](.cursor/rules/) |
