# Deploying Driftless to Railway

The other path — see [DEPLOYMENT.md](./DEPLOYMENT.md#deploying-driftless) if you want the
self-hosted (VPS) one instead. This page assumes you're deploying fresh onto Railway, with no
existing self-hosted install to migrate from.

## Why this looks nothing like the self-hosted guide

The self-hosted model is one persistent checkout, mutated in place by every release, with three
processes (web, worker, maintenance) all reading the same disk. That doesn't fit Railway:
**a Railway Volume attaches to exactly one service and cannot be shared across services** — so
three processes sharing one filesystem is not something Railway can do, no matter how the
services are wired. Railway's own model is the opposite anyway: build a fresh image per deploy,
run it, and the new deploy *is* the release (no symlink-swap dance needed — Railway's own
rollout is already atomic).

The one place this bites: media/digital-download storage. Point it at an
**S3-compatible bucket** (see [storage-driver.md](./ai/storage-driver.md)) instead of local disk,
and the constraint disappears — every process reaches the same bucket regardless of which
service it's running as. This guide assumes `STORAGE_DRIVER=s3`; the section on storage below
also covers the local-disk-plus-Volume fallback if you'd rather not deal with an S3 bucket.

## Topology

One Railway project, one environment (`production` to start). All three app services build from
the **same repo, same root directory, same Build Command** — only the Start Command differs per
service. This is Railway's own "shared monorepo" pattern; Driftless isn't a true multi-package
monorepo, so no per-service root directory is needed.

| Service | Type | Start Command | Volume | Healthcheck | Pre-Deploy Command |
|---|---|---|---|---|---|
| `web` | Web (exposed) | `node build/bin/server.js` | Only if using local storage | `/health` | migrations + seed |
| `worker` | Background (no port) | `node build/bin/console.js queue:work` | No | No | — |
| `maintenance` | Cron Job, `*/5 * * * *` UTC | `node build/bin/console.js modules:maintenance` | No | No | — |
| Postgres | Railway DB plugin | — | managed | — | — |
| Redis | Railway DB plugin | — | managed | — | — |

**Build Command**, identical on all three app services:

```
npm_config_production=false npm install && npm run build
```

**Use `npm install`, not `npm ci`.** Railpack caches `node_modules` (including Vite's
`node_modules/.vite` pre-bundle cache) across builds via a mount, and `npm ci` begins by
`rm -rf`-ing the whole `node_modules` — which fails on that mounted cache dir with
`npm error EBUSY: resource busy or locked, rmdir '/app/node_modules/.vite'` and aborts the
build. `npm install` reconciles `node_modules` in place instead of wiping it first, so it
coexists with the cache. The lockfile is still respected (an existing `package-lock.json` makes
`npm install` install the locked versions); reproducibility is effectively the same here.

`npm run build` runs AdonisJS's own `prebuild` first via the npm lifecycle — clean, then the
`generate-module-sources.mjs` / `generate-code-pages.mjs` / `generate-custom-templates.mjs`
generators, then `node ace mcp:catalog`, then `node ace build` itself (compiles TypeScript, runs
Vite, produces `build/` including `build/public/assets/.vite/manifest.json`). **Never**
`--omit=dev` — Vite/TypeScript/Tailwind are devDependencies needed at build time, and
Railway's build layer carries the whole `node_modules` straight into the running container (no
separate "prune for production" stage), so the self-hosted guide's objection to `--omit=dev`
doesn't apply here — there's no second install step to strip anything from.

**`npm_config_production=false` is required, not optional**, even though the command is otherwise
plain `npm install`: `NODE_ENV=production` is a required runtime env var on every service (see the
table below), and it's present during the build step too — npm reads it and silently skips
installing devDependencies whenever `NODE_ENV=production` is set, for both `npm install` and
`npm ci` alike (this is still true on modern npm; it was not removed in npm 7 as commonly
believed). Without the override, `node ace build`/`node ace mcp:catalog` fails with an obscure
`Cannot find module '.../@poppinss/ts-exec/...'`-style resolution error, because the whole
TypeScript/Vite toolchain is devDependencies. `npm_config_production=false` forces npm to install
them regardless of `NODE_ENV`; it has no effect on the running app once built.

`package.json`'s own `"start"` script (`node current/bin/server.js`) is **not** used — it points
at the self-hosted `current` symlink, which won't exist. Each service's Start Command is set
directly in its Railway settings (or `railway.json`), pointing at `build/` instead.

### Node version is pinned to 24.19.0 — do not let the builder pick "latest 24"

`.nvmrc` and `.node-version` both pin **24.19.0**, and you should also set
`RAILPACK_NODE_VERSION=24.19.0` as a service variable (the builder's most authoritative source)
so the pin can't be missed. This is not cosmetic: **Node 24.20.0 and 24.21.0 ship an `ada`-url
regression that breaks AdonisJS ace's command-metadata validation.** Every `node ace` invocation
(`mcp:catalog` during the build, `migration:run` in the Pre-Deploy Command, and `queue:work` /
`modules:maintenance` at runtime on the worker and cron services) boots the ace kernel, which
validates every command through the `jsonschema` library. On 24.20/24.21 that validation throws a
bare `RuntimeException: Invalid command exported from "analytics_prune.js" file. Invalid URL`
(the first command scanned takes the blame; the real cause is `new URL()` rejecting an
opaque-base reference that older/newer Node accepted). Railpack otherwise installs the newest
Node 24 LTS — which is currently in the broken range — so the pin is mandatory. Node 24.19.0,
Node 22.x, and Node 25.9+ are all unaffected; 24.19.0 is the newest 24-line release that works.

### `.adonisjs/client/registry/` is committed on purpose

The build resolves `@generated/registry` (the Tuyau typed-API-client registry) from
`.adonisjs/client/registry/`. That directory is generated **only** by the dev server's route
scanner — `node ace build` never regenerates it — so it is committed to git even though the rest
of `.adonisjs/` is ignored. A fresh clone (which is exactly what Railway builds) would otherwise
fail the Vite step with `Could not load .../.adonisjs/client//registry`. When you add or change
routes, run `npm run dev` once to regenerate it and commit the result, or the deployed typed
client goes stale (it won't break the build — the files just describe older routes).

## 1. Prerequisites

- A Railway account with the repo's GitHub connected (or the CLI logged in).
- If using S3 storage (recommended): an S3-compatible bucket + access keys. For Cloudflare R2:
  create a bucket, then **Manage R2 API Tokens → Create API Token → "Object Read & Write"**,
  scoped to just that bucket (not account-admin). You'll need the bucket name, the account's R2
  endpoint (`https://<account_id>.r2.cloudflarestorage.com` — **no bucket name in the URL**), the
  Access Key ID and the Secret Access Key.

## 2. Create the project and provision Postgres + Redis

1. New Railway project from the GitHub repo.
2. **Add → Database → PostgreSQL.**
3. **Add → Database → Redis.**

Both need to exist before wiring reference variables in the next steps.

## 3. Storage

**Recommended — S3-compatible bucket (Cloudflare R2 or similar):** no Railway Volume needed at
all. Set on `web` and `worker` (see the full variable table below):

```
STORAGE_DRIVER=s3
S3_ENDPOINT=<your R2 account endpoint, no bucket suffix>
S3_BUCKET=<bucket name>
S3_ACCESS_KEY_ID=<...>
S3_SECRET_ACCESS_KEY=<...>
S3_REGION=auto
```

This is what lets `worker` (which runs the site export/import job, reading/writing media
directly — see [storage-driver.md](./ai/storage-driver.md)) reach the exact same files `web`
does, and it removes two Volume-specific tradeoffs entirely: `web` can run replicas, and a
redeploy of `web` has no extra downtime.

**Fallback — local disk + Railway Volume:** leave `STORAGE_DRIVER` unset (defaults to `local`),
and attach a Volume to the `web` service only, mounted at `/app/storage` (the common parent of
both `storage/media` and `storage/protected/ecommerce` — no code changes needed for that choice).
Two accepted tradeoffs come with this: **`web` cannot run replicas while a Volume is attached**,
and **every `web` redeploy has a brief unavoidable downtime window** even with a healthcheck
configured (Railway serializes deploys of a volume-attached service to avoid two deployments
writing to the same volume at once). It also means `worker`'s site export/import job cannot see
the same files `web` does — that specific admin feature (Settings → Import/Export) will silently
produce incomplete bundles in this mode. If that limitation matters to you, use S3 instead.

## 4. Create the `web` service

1. New service from the same GitHub repo/branch.
2. **Settings → Build:** Build Command `npm_config_production=false npm install && npm run build`.
3. **Settings → Deploy:** Start Command `node build/bin/server.js`. Healthcheck Path `/health`.
4. If using local storage, attach a Volume now (mount path `/app/storage`).
5. Set every env var from the table below **except** `APP_URL` and the Redis vars — both need
   information that doesn't exist yet (see steps 5 and 3's `S3_*` above).
6. Deploy. Once it's live, **Settings → Networking → Generate Domain** to get a public URL.
7. Set `APP_URL` to that generated domain, and redeploy. This two-step is unavoidable: the domain
   doesn't exist until the first deploy succeeds.
8. **Settings → Deploy → Pre-Deploy Command:**
   ```
   node build/bin/console.js migration:run --force && node build/bin/console.js db:seed
   ```
   Runs after build, before the deploy takes traffic (gated by the healthcheck). `db:seed`
   (roles/permissions/the first admin, from `SEED_ADMIN_*`) is explicitly idempotent — safe to
   run on every deploy alongside migrations, not just the first one. Redeploy once more to
   actually run it for the first time.

## 5. Create the `worker` service

Same repo, same Build Command, same env vars as `web` (including `DATABASE_URL` and the Redis/S3
vars) — **no** `APP_URL` requirement beyond what's already needed for links in emails, **no**
volume, **no** healthcheck, **no** Pre-Deploy Command (one migration runner is enough).

**Settings → Deploy:** Start Command:

```
node build/bin/console.js queue:work
```

This is what actually delivers mail, retries failed payment webhooks, and runs site export/import
jobs. Skipping this service doesn't break the app — `QUEUE_ENABLED=false` (or no worker running)
falls back to running those jobs synchronously in-request — but webhook retries specifically stop
happening, which matters for an e-commerce site.

## 6. Create the `maintenance` service (Cron Job)

Same repo, same Build Command, same `DATABASE_URL` (and Redis vars if the maintenance sweep ever
touches them — check `commands/modules_maintenance.ts` if unsure).

**Settings → Deploy:** Start Command:

```
node build/bin/console.js modules:maintenance
```

**Settings → Cron Schedule:** `*/5 * * * *` (Railway's minimum granularity is 5 minutes, cron
runs in UTC). Railway Cron Jobs run the start command on schedule and expect the process to
**exit** when done — `modules:maintenance` is already a one-shot, idempotent sweep (releases
stock held by abandoned checkouts, matures affiliate commissions, closes orders past their refund
window), so this is a direct fit; if a run is still going when the next trigger fires, Railway
skips that trigger rather than stacking runs.

## 7. Environment variables

Set on `web` and `worker` (`maintenance` needs at least `DATABASE_URL`; add the rest if it turns
out to need them):

| Var | Value |
|---|---|
| `PORT` | Auto-injected by Railway — do not set manually |
| `NODE_ENV` | `production` |
| `TZ`, `LOG_LEVEL` | Copy `.env.example` defaults |
| `HOST` | `0.0.0.0` |
| `APP_KEY` | Generate fresh: `node ace generate:key` locally, paste the value — **never reuse the dev key** |
| `APP_URL` | The Railway-generated domain — set on the *second* deploy (see step 4.7) |
| `TRUST_PROXY` | `true` (trust Railway's edge) — see the verification step below |
| `SESSION_DRIVER` | `cookie` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — matches `config/database.ts` exactly, no code change |
| `STORAGE_DRIVER` + `S3_*` | See §3 |
| `MEDIA_URL_PREFIX` | Leave default |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_USERNAME` | Your own real values, never sample credentials |
| `LIMITER_STORE` | `redis` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | From the Redis plugin — see the note below |
| `QUEUE_ENABLED` | `true` |
| SMTP vars | Optional — an empty `SMTP_HOST` just disables mail with a clear error, not a hard requirement |
| Captcha/analytics vars | Optional |
| `DISABLE_OFFLINE` | Leave the documented default |

**Redis variable mapping:** Driftless wants three separate vars
(`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` — one for `@adonisjs/limiter`'s rate limiting, one for
BullMQ on db 1, see `config/redis.ts` / `app/services/queue/connection.ts`), not one connection
URL. Open the Redis plugin's **Variables** tab once it exists: if it exposes them individually
(commonly `REDISHOST`/`REDISPORT`/`REDISPASSWORD`), reference them the same way as
`DATABASE_URL` (`${{Redis.REDISHOST}}`, etc.). If it only exposes a combined `REDIS_URL`, don't
improvise a code change on your own — that needs a small, deliberate addition to those two files
(a URL-parsing fallback), not a guess made mid-deploy.

## 8. First-boot order, summarized

1. Project → Postgres → Redis.
2. Set up the S3 bucket (or decide on the Volume fallback).
3. Create `web`: build/start command, storage, every env var except `APP_URL` and Redis (resolve
   the Redis mapping first).
4. Generate `web`'s domain → set `APP_URL` → redeploy.
5. Set `web`'s Pre-Deploy Command → redeploy (first real migration run + seed).
6. Create `worker`.
7. Create `maintenance` as a Cron Job.

## 9. Verification

- `GET https://<web-domain>/health` → `200`.
- Log into `/admin` with the `SEED_ADMIN_*` credentials.
- **Storage**: upload a media file via admin, confirm its URL resolves; if using S3, confirm the
  object actually exists in the bucket (not just that the app returned success); redeploy `web`
  and confirm the file still resolves.
- **Worker**: trigger an action that sends an email with `QUEUE_ENABLED=true`; check the `worker`
  service's logs to confirm BullMQ actually processed it (not a silent fallback to synchronous
  execution, which would mask broken Redis wiring).
- **Export/import** (the thing S3 storage specifically fixes): run a site export from
  Settings → Import/Export, download the resulting archive, and confirm it actually contains
  media file bytes rather than silently-skipped "file missing" rows.
- **Cron**: after 5–10 minutes, check the `maintenance` Cron Job's run history — fired on
  schedule, exited cleanly, no overlap warnings.
- **`TRUST_PROXY`**: hit a rate-limited `/api/v1` endpoint from two different real client IPs and
  confirm each gets its own limiter bucket — proves `request.ip()` resolves the real client
  through Railway's edge proxy rather than bucketing every visitor under one shared address.
  Mirrors [DEPLOYMENT.md](./DEPLOYMENT.md)'s self-hosted checklist item on the same setting.
- `GET /api/admin/health` (authenticated) shows no safe-mode / module-boot failures.

## 10. Known limitations

- The `screenshot_page` MCP tool (AI page-builder preview rendering) needs Chromium, which this
  guide doesn't install (Railway's automatic Nixpacks build, no custom Dockerfile). It can be
  added later with a Dockerfile that bakes in the browser at build time, if that MCP feature
  becomes something you need.
- Local-disk storage (the Volume fallback in §3) caps `web` at zero replicas, adds a short
  downtime window per redeploy, and leaves the worker's export/import job unable to see media —
  all three go away by switching to `STORAGE_DRIVER=s3`.

## Deploying without GitHub (manual upload via CLI)

Use this path if the site depends on **custom template kits** (`inertia/custom/kits/<id>/`).
Kits are gitignored on purpose (they're operator payloads, not repo source), and a kit is React
code compiled at **build** time. A GitHub-connected Railway service builds from a fresh checkout
of the repo, so a gitignored kit is never in the image — any page built on it fails with
`Unknown custom template "kit:<id>"`. Redeploying doesn't help: every deploy rebuilds from the
source, and files an import staged onto the running container's disk are thrown away with it.
(A Volume doesn't help either — volumes are mounted at runtime, not during the build.)

`railway up` instead uploads your **local project folder** and builds that. With
`--no-gitignore` the CLI stops applying `.gitignore`, so the kits on your disk are uploaded and
compiled — without changing `.gitignore`.

**Everything else `.gitignore` excludes must still stay out**, which is what the committed
[`.railwayignore`](../.railwayignore) is for: `node_modules`, `build`, `public/assets`, local
`.env` files and `shared/` (secrets), `releases/`, `storage/`, and regenerated codegen. It mirrors
`.gitignore` minus the kits. **Keep the two in sync** — if you add something to `.gitignore` that
must not reach Railway (especially anything holding a secret), add it to `.railwayignore` too.

### One-time setup

1. **Disconnect GitHub**: service **Settings → Source → Disconnect**. Otherwise the next `git push`
   triggers a GitHub build *without* your kits and replaces the manual deploy.
2. Install the CLI and log in: `railway login`.
3. From the project root, link the directory to the service:
   ```bash
   railway link
   ```
   (pick the project, the `production` environment, and the `driftless` service).

Build Command, Start Command, Pre-Deploy Command, variables and the Node pin all stay exactly as
configured above — only the *source* of the build changes.

### Every deploy

From the project root:

```bash
railway up --no-gitignore --service driftless
```

Add `--detach` to return immediately instead of streaming the build log.

### Things to know

- **What deploys is your working tree at that moment**, including uncommitted changes. Commit (or
  at least review `git status`) before uploading so you know what's live.
- **Verify the first upload.** Watch the build log and confirm the upload isn't hundreds of MB
  (that would mean `node_modules` or `releases/` slipped through). Railway still injects its own
  variables, so a missing local `.env` is expected and correct.
- The generated kit manifests (`app/services/custom_templates.generated.ts`, etc.) are rebuilt by
  the `prebuild` hook from whatever kits were uploaded, so a kit you delete locally disappears from
  the next deploy.
- No auto-deploy: every release is a manual `railway up`. To go back to GitHub deploys later:
  `railway service source connect --repo <owner>/<repo> --branch main --service driftless` (and
  accept that gitignored kits won't be in that build).
- The export/import archive still carries the DB side of kit pages (page rows + kit activation).
  Once the target is deployed this way *with* the same kits, a re-import renders those pages.

## Redeploying

GitHub-connected: push to the connected branch, or trigger a redeploy from the Railway dashboard.
Manual upload: run `railway up --no-gitignore --service driftless` again. Either way that's the
whole release process; there's no separate "cut a release" step the way the self-hosted model has
one. The Pre-Deploy Command (migrations + seed) runs again automatically before traffic switches
over.
