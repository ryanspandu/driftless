# Development workflow

## Prerequisites

- **Node.js ≥ 24**
- **PostgreSQL 16** (local via Docker recommended)

## First-time setup

```bash
docker compose up -d
cp .env.example .env
# Edit .env — set APP_KEY (node ace generate:key), DATABASE_URL, secrets
node ace migration:run
node ace db:seed
npm install
npm run dev
```

Default database URL: `postgresql://postgres:postgres@localhost:5433/driftless` (port **5433** maps to container 5432).

## npm scripts

| Script | Command | Use |
|--------|---------|-----|
| `dev` | `node ace serve --hmr` | Local development with Vite HMR |
| `serve` | Same as `dev` | Alias |
| `build` | `node ace build` | Production compile |
| `start` | `node bin/server.js` | Run production build |
| `test` | `node ace test` | Japa test runner |
| `typecheck` | `tsc` + inertia `tsc` | Type-check backend and frontend |
| `lint` | `eslint .` | Lint |
| `format` | `prettier --write .` | Format |

`postbuild` runs `scripts/sync-public-assets.mjs` (copies `build/public/assets` → `public/assets`).

## Dev server rules

- Use **`npm run dev`** (sets `DEV_MODE`, starts Vite dev server). `npm run serve` is an alias.
- **"Cannot read the manifest file when running in dev mode" is now handled automatically.** A stale `public/assets/.vite/manifest.json` (left by a prior `npm run build`) no longer crashes the dev server:
  - `predev` / `preserve` run `scripts/clean-vite-dev.mjs` to delete the stale manifest before the dev server starts.
  - `providers/vite_dev_provider.ts` forces `vite.hasManifestFile = false` whenever `DEV_MODE` is set, so Inertia never reads the manifest in dev (even when started directly via `node ace serve`).
  - Production (`npm start`, no `DEV_MODE`) is untouched and still reads the manifest.
  - If you ever need to clear it manually: `node scripts/clean-vite-dev.mjs`.

## Environment variables

See `.env.example`. Important:

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Must point at **driftless** DB, not legacy stack |
| `SEED_ADMIN_PASSWORD` | Quote values containing `#` (dotenv comment) |
| `FORCE_SEED_PASSWORD=1` | Dev only — reset seeded admin password |
| `DISABLE_OFFLINE=1` | Disables offline/PWA client features when set |
| `MEDIA_STORAGE_PATH` | Local media files |
| `GOOGLE_*` | OAuth; can also be configured in Admin → Integrations |
| `TURNSTILE_*`, `HCAPTCHA_*`, `RECAPTCHA_*` | CAPTCHA providers |

## Database

```bash
node ace migration:run
node ace migration:rollback
node ace db:seed
```

## Legacy migration (legacy stack)

Use the dedicated migration doc — do not duplicate steps here:

- [docs/LEGACY_MIGRATION.md](../LEGACY_MIGRATION.md)
- Ace command: `node ace migrate:from-legacy` (see `commands/migrate_from_legacy.ts`)

## Production build

```bash
npm run build
npm start
```

Ensure `public/assets` is populated (build + `postbuild` sync).

## Related

- [testing.md](./testing.md)
- [conventions.md](./conventions.md)
- [AGENTS.md](../../AGENTS.md)
