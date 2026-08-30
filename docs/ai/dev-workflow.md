# Development workflow

## Prerequisites

- **Node.js ≥ 24**
- **PostgreSQL 16** (local via Docker recommended)

## First-time setup

```bash
docker compose up -d
cp .env.example .env
npm install   # required before any `node ace` command
# Edit .env — set APP_KEY (node ace generate:key), DATABASE_URL, secrets
node ace migration:run
node ace db:seed
npm run dev
```

Default database URL: `postgresql://postgres:postgres@localhost:5433/driftless` (port **5433** maps to container 5432).

## npm scripts

| Script      | Command                | Use                             |
| ----------- | ---------------------- | ------------------------------- |
| `dev`       | `node ace serve --hmr` | Local development with Vite HMR |
| `serve`     | Same as `dev`          | Alias                           |
| `build`     | `node ace build`       | Production compile              |
| `start`     | `node bin/server.js`   | Run production build            |
| `test`      | `node ace test`        | Japa test runner                |
| `typecheck` | `tsc` + inertia `tsc`  | Type-check backend and frontend |
| `lint`      | `eslint .`             | Lint                            |
| `format`    | `prettier --write .`   | Format                          |

`postbuild` runs `scripts/sync-public-assets.mjs` (copies `build/public/assets` → `public/assets`).

### Long-running and scheduled processes

Neither is needed for local development, but both are required in production:

| Process          | Command                                      | What breaks without it                                                                                                                                                                                            |
| ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue worker     | `node ace queue:work`                        | Emails and webhook follow-up sit undelivered. Nothing money-affecting is lost — every such transition commits synchronously in whichever process observed it                                                      |
| Maintenance cron | `node ace modules:maintenance`, every ~5 min | Real breakage: stock reserved by abandoned checkouts is never released, affiliate commissions never mature, failed webhooks are never retried. See [modules.md](./modules.md#maintenance--scheduled-housekeeping) |

## Dev server rules

- Use **`npm run dev`** (sets `DEV_MODE`, starts Vite dev server). `npm run serve` is an alias.
- **"Cannot read the manifest file when running in dev mode" is now handled automatically.** A stale `public/assets/.vite/manifest.json` (left by a prior `npm run build`) no longer crashes the dev server:
  - `predev` / `preserve` run `scripts/clean-vite-dev.mjs` to delete the stale manifest before the dev server starts.
  - `providers/vite_dev_provider.ts` forces `vite.hasManifestFile = false` whenever `DEV_MODE` is set, so Inertia never reads the manifest in dev (even when started directly via `node ace serve`).
  - Production (`npm start`, no `DEV_MODE`) is untouched and still reads the manifest.
  - If you ever need to clear it manually: `node scripts/clean-vite-dev.mjs`.

## Environment variables

See `.env.example`. Important:

| Variable                                   | Notes                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Must point at **driftless** DB, not legacy stack                                                  |
| `SEED_ADMIN_PASSWORD`                      | Required for production seed; use a unique value and quote values containing `#` (dotenv comment) |
| `FORCE_SEED_PASSWORD=1`                    | Dev only — reset seeded admin password                                                            |
| `DISABLE_OFFLINE=1`                        | Disables offline/PWA client features when set                                                     |
| `MEDIA_STORAGE_PATH`                       | Local media files (default `./storage/media`); directory is created automatically on first upload |
| `GOOGLE_*`                                 | OAuth; can also be configured in Admin → Integrations                                             |
| `TURNSTILE_*`, `HCAPTCHA_*`, `RECAPTCHA_*` | CAPTCHA providers                                                                                 |

## Database

```bash
node ace migration:run
node ace migration:rollback
node ace db:seed
node ace migration:fresh --seed   # ⚠️ drops ALL tables, re-migrates, re-seeds
```

`migration:fresh --seed` rebuilds the database from scratch — use it to reset a
dev DB to a clean state (e.g. after schema/seed changes). It deletes all data.

## Legacy migration (legacy stack)

Use the dedicated migration doc — do not duplicate steps here:

- [docs/LEGACY_MIGRATION.md](../LEGACY_MIGRATION.md)
- Ace command: `node ace migrate:from-legacy` (see `commands/migrate_from_legacy.ts`)

## Test suite speed

`npm test` runs ~330 real functional tests: a real SQLite database, real migrations, real
HTTP through the whole stack. Nothing is mocked, which is why the suite has caught bugs a
mocked one could not — a pg-only `to_regclass`, a knex `sum(raw)` that silently mangles the
SQL, a column that does not exist on SQLite.

The cost of that realism is the **per-test reset**: every test truncates the database and
re-seeds it, so no test can be made to pass or fail by another's leftovers.

That reset is the thing to keep cheap. Three places used to do a `SELECT` then an
`INSERT`/`UPDATE` **per row** — `main_seeder`, `ModulesService.mintPermissions` and
`ModulesService.mintPermissions` — roughly 150 round trips before each of 330 tests. All
three now do **one SELECT and one batched INSERT**, and only write a row when something
actually differs. That took the suite from ~7 minutes to ~3.5.

Two rules follow, and both matter beyond the test suite (the mint runs on every boot):

- **Never loop a query over a constant list.** Load the set once, diff it in memory, batch
  what is missing.
- **Do not write a row that has not changed.** An unconditional `save()` in a sync loop is
  a write per row on every run, for nothing.

If the suite creeps back up, measure before changing anything — the cost has moved between
truncate, seed and permission-minting more than once, and each time the guess was wrong.

## Production build

```bash
npm run build
npm start
```

Ensure `public/assets` is populated (build + `postbuild` sync).

### Building locally breaks `npm test` until you clean up

`postbuild` copies `build/public/assets` into `public/assets`. Once that directory has a
Vite manifest, the app treats itself as a production build in **every** environment —
including tests, where the dev Vite server is not running. Every Inertia page render then
500s, and the failures look unrelated to whatever you were working on.

Both paths are gitignored, so removing them is always safe:

```bash
rm -rf public/assets build
```

Worth knowing before you spend an hour on "my tests broke and I didn't touch that code".

### Background jobs

```bash
node ace queue:work     # or: npm run worker
```

A second long-running process alongside `npm start`. The app degrades safely without it —
money-affecting transitions commit synchronously, and reconcile sweeps re-drive anything
the queue was holding — but emails and webhook follow-up work wait until a worker returns.
Set `QUEUE_ENABLED=false` to disable queuing entirely (no Redis needed).

## Related

- [testing.md](./testing.md)
- [conventions.md](./conventions.md)
- [AGENTS.md](../../AGENTS.md)
