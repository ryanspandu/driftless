# Deploying Driftless

Driftless is **self-hosted from a source checkout**, not from a slim build artifact. That is
a deliberate constraint, and the reason for it decides everything else on this page.

## Why the source tree has to stay on the server

Installing an app from the marketplace can rebuild the front-end. `build/` cannot do that to
itself: `tsconfig.json` excludes `inertia/**` and `modules/**/ui/**`, so a built tree contains
**no `.tsx` at all**, and `npm ci --omit=dev` removes Vite, TypeScript and Tailwind along with
the rest of the devDependencies.

So the AdonisJS default of `cd build && npm ci --omit=dev && node bin/server.js` is not usable
here. Keep the checkout, keep the full `node_modules`, and cut releases from it. This is the
same shape Strapi and Ghost use, for the same reason.

## Layout

```
/opt/driftless/               the checkout — npm install runs here
  releases/<timestamp>/       one complete, verified build each
  current -> releases/…       a symlink; swapping it is one atomic rename
  shared/                     state that outlives a release
    .env
    storage/                  digital products customers have paid for
    uploads/                  the media library
    tmp/                      safe-mode sentinel, installer staging
  node_modules/               shared by every release
```

`shared/` is the half that matters. `storage/protected/` and `public/uploads/` used to live
inside the build tree, which meant **every rebuild deleted them**. Each release symlinks those
paths back out, so `app.publicPath('uploads')` resolves through the link and writes land
somewhere a build cannot reach. The source checkout is linked to the same directories, so
development and production share one dataset rather than quietly diverging.

## First install

```bash
git clone <repo> /opt/driftless && cd /opt/driftless
npm ci                      # full install — devDependencies included, on purpose
cp .env.example .env        # then edit it
node ace generate:key
node ace migration:run
npm run release             # build, verify, publish
```

Then start it under a supervisor (below) and visit `/health`.

## Cutting a release

```bash
npm run release             # keeps the last 3 by default; --keep=5 to hold more
npm run rollback            # point `current` back at the previous release
```

`npm run release` builds into a fresh directory, **verifies the build before publishing it**
(`scripts/verify-build.mjs` — every asset referenced by the manifest exists, and nothing on
disk is unreferenced), then moves the `current` symlink with a single atomic `rename`.

If the build fails, nothing moves. The site keeps serving the previous release throughout.

**The process restarts itself afterwards.** A release changes `current/`, and the SSR bundle
plus every lazily-imported controller are read from the tree this process booted from — so
until it cycles, the site serves the previous build. A watcher notices within about ten
seconds and restarts (`app/services/restart_watcher.ts`).

> **This is a behaviour change.** Running `npm run release` at 3pm now restarts the app at
> 3pm, not whenever you get round to it. Set `DRIFTLESS_AUTO_RESTART=0` if you want to
> schedule the restart yourself.

## Supervisor — required, not optional

Installing an app that ships UI ends by **exiting the process** so the supervisor brings it
back. Spawning a replacement from inside the app loses the port-bind race, orphans processes,
and has nothing to fall back on when the replacement fails to start.

`app/services/supervisor.ts` detects PM2 (`app.managedByPm2`), systemd (`INVOCATION_ID`),
containers (PID 1) and an explicit `DRIFTLESS_SUPERVISED=1`. **When it detects none of these,
the installer refuses to exit** and asks the operator to restart instead — never kill a
process nobody will restart.

### Choosing one

| | RAM | During a restart | Setup | Where |
|---|---|---|---|---|
| **systemd + socket activation** ★ | one process | **No request is refused.** Arrivals queue in the kernel and wait out one boot | two extra files | a VPS you control |
| PM2 fork *(default)* | one process | A few seconds where nothing answers | one command | anywhere |
| systemd | one process | A few seconds where nothing answers | copy the units | a VPS you control |
| PM2 cluster | **× workers** | Workers restart one at a time; the site stays up | one command, needs ≥ 2 workers | boxes with ~4 GB |
| Docker Compose | one process | A few seconds where nothing answers | `docker compose up` | container hosts |

**Socket activation is the recommendation for self-hosting.** It is the only option that costs
no extra memory and still drops no connections.

It is *not* zero downtime, and the admin UI is careful not to say so: a visitor who arrives
mid-restart waits out a full application boot. Driftless measures that number on your box and
shows it to you before you press Install.

PM2 cluster is the weakest trade here. Every worker holds its own module registry, CMS native
collections and SSR bundle, so two workers is most of a 1 GB VPS — and `max_memory_restart`
means a front-end build's memory spike can trip an unrelated worker restart mid-install.

### PM2 (default — one process, brief gap)

```bash
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup
```

### PM2 cluster (opt-in — needs memory)

```bash
pm2 start deploy/ecosystem.cluster.config.cjs
pm2 reload driftless          # the zero-downtime deploy verb in this mode
```

`instances` is `2`, not `'max'`. Raise it deliberately; `'max'` on a 2-vCPU box is the usual
way to OOM it.

### systemd

```bash
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now driftless driftless-worker driftless-maintenance.timer
```

### systemd + socket activation (recommended)

```bash
sudo cp deploy/systemd/driftless.socket /etc/systemd/system/
sudo cp -r deploy/systemd/driftless.service.d /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now driftless.socket
sudo systemctl restart driftless
```

systemd holds the listening socket across restarts, so nothing is refused. `PORT` is still
required in `shared/.env` even though nothing binds it in this mode.

For several web processes over the same socket, `deploy/systemd/driftless@.service` — advanced,
and **not** to be combined with PM2 cluster or the plain `driftless.service`.

## Shutdown

`SIGTERM` drains in-flight requests for up to `DRIFTLESS_DRAIN_MS` (default 10s) and then cuts
what is left. Every shipped supervisor config allows more than that before it sends `SIGKILL`;
if you write your own, make sure yours does too, or the drain is pointless.

## Three processes, not one

| Process | Command | What breaks without it |
|---|---|---|
| Web | `node current/bin/server.js` | — |
| Queue worker | `node current/bin/console.js queue:work` | mail is never delivered, payment webhooks are never retried |
| Maintenance | `node current/bin/console.js modules:maintenance`, every 5 min | stock held by abandoned checkouts is never released, commissions never mature, delivered orders never close |

The last two fail **silently**. Nothing on the site reports that they are missing, which is
why they are listed here rather than left to discover.

## Health

- `/health` — public. `{ ok, version }` and nothing more; a list of installed packages and
  their versions is a shopping list for whoever is looking up known vulnerabilities.
- `/api/admin/health` — behind auth: database, asset state, safe mode, modules that failed to
  boot.

**Both return 503 when the database is unreachable or the built assets do not match their
manifest.** Point your load balancer at `/health`; the asset check catches the state where
the app boots, every route answers, and every page is blank.

## Docker

A container image is a *runtime over a mounted checkout*, not a self-contained artifact — the
marketplace needs a writable source tree and full `node_modules`. `npm ci --omit=dev` must
never be used. PM2 or systemd on a plain VPS is the documented default.

## Installing a module from the admin UI

Drop the folder into `modules/`, then **Settings → Modules**. Folders the running
server has not loaded appear with a *Found on disk* badge. The dialog states, before anything
happens: which migrations will run, whether the front-end will be rebuilt, and what the restart
will do to your visitors.

Requires the `module:install` permission, which ADMIN and SUPERADMIN hold. Capped at **3 per
hour per user** — that permission is effectively the ability to run a build on your server, so
the cap is a security control rather than a courtesy.

`node ace modules:install <name>` does exactly the same work from a terminal.

### Memory

A front-end rebuild peaks well over 1 GB. Driftless refuses to start one below
`DRIFTLESS_MIN_FREE_MEM_MB` (default 1536) free, because the realistic bad outcome on a small
box is not a failed build — it is the OOM killer choosing Postgres.

## What has to be checked by hand

Automated tests cannot reach these. Run through them once on a real box after any change to
the restart layer:

1. **CSRF** — `config/shield.ts` disables it entirely under `NODE_ENV=test`, so no functional
   test can prove the token path. A `POST /api/admin/modules/:name/install` without
   `X-XSRF-TOKEN` must be rejected.
2. **`process.env.instances` under PM2 cluster** — the one input that can silently downgrade
   the "your site stays online" claim to "brief restart". Check `/api/admin/deployment`
   reports `restartKind: "rolling"` and the right `workers`.
3. **`wait_ready`** actually firing — `pm2 reload driftless` should wait for the new process to
   listen rather than returning immediately.
4. **fd 3 inheritance** — under a real `driftless.socket`, run `hey`/`ab` across an install and
   confirm **zero connection errors** and one band of elevated latency matching `bootMs`.
5. **The full drop-in loop** — copy a module folder onto a running server, press Install, and
   confirm one restart brings it up loaded, migrated, built and enabled.

## Recovering a broken install

See [RECOVERY.md](./RECOVERY.md).
