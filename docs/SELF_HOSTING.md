# Self-hosting Driftless

For operators running Driftless on their own server. If you are deploying it as a developer,
[DEPLOYMENT.md](./DEPLOYMENT.md) has the mechanics; this page is the shorter version plus the
things that are easy to get wrong.

## What you need

| | Minimum | Why |
|---|---|---|
| RAM | **2 GB** | Installing an app rebuilds the front-end: two Vite passes and a full TypeScript compile over ~300 chunks. On 1 GB the build is OOM-killed, and it can take the web process with it |
| Disk | 3 GB | The checkout, `node_modules`, and the last few releases |
| Node | 24+ | |
| Postgres | 16+ | |
| Redis | 7+ | Queued jobs live only in Redis — run it with AOF on |

## Install

```bash
curl -fsSL https://get.driftless.dev | bash
```

Or by hand — see [DEPLOYMENT.md](./DEPLOYMENT.md#first-install).

The installer stops after creating `shared/.env` so you can fill in `DATABASE_URL`, `APP_URL`
and `APP_KEY`, then finishes when you run it again.

## The part people get wrong: three processes

Driftless needs **three**, and two of them fail silently — nothing on the site tells you they
are missing.

| Process | Missing means |
|---|---|
| Web | — |
| Queue worker | Email is never delivered. Payment webhooks are never retried |
| Maintenance (every 5 min) | Stock held by abandoned checkouts is never released. Affiliate commissions never mature. Delivered orders never close |

`deploy/ecosystem.config.cjs` (PM2) and `deploy/systemd/` set up all three.

## Why a supervisor is required

Installing an app that ships UI ends by **exiting the process** so the supervisor restarts it.
Driftless will not exit if it cannot detect one — it stops and shows you the command to run
instead. Never leave it running unsupervised in production.

**Use systemd socket activation if you can.** It is the only setup that costs no extra memory
and still refuses no connections during a restart — visitors who arrive mid-restart wait a few
seconds instead of seeing an error. Two extra files:

```bash
sudo cp deploy/systemd/driftless.socket /etc/systemd/system/
sudo cp -r deploy/systemd/driftless.service.d /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now driftless.socket
sudo systemctl restart driftless
```

[DEPLOYMENT.md](./DEPLOYMENT.md#choosing-one) compares all five options.

## Installing apps and plugins

Put the folder in `modules/<name>/`, then either:

**From the admin UI** — Settings → Application → Modules. A folder the running server has not
loaded yet shows up with a *Found on disk* badge and an Install button. Before anything
happens the dialog tells you which migrations will run, whether the front-end will be rebuilt,
and exactly what the restart does to your visitors. You can close the tab; the result is
waiting when you come back.

**From a terminal** — `node ace modules:install <name>`, which does the same work.

Either way it checks the package is compatible with your Driftless version, runs its
migrations, rebuilds the front-end **only if the package ships one**, enables it, and restarts.
Skipping the rebuild is the silent failure: routes work, the module reports itself enabled, and
its pages are blank.

> A rebuild needs about **1.5 GB free memory**. Driftless refuses below that rather than
> letting the OOM killer pick a victim — which on a small box is as likely to be Postgres as
> the build.

## Restarts happen on their own

`npm run release`, or an install that rebuilds, swaps the `current` symlink. The running
process notices within about ten seconds and restarts itself, because until it does it is
serving the previous build. Set `DRIFTLESS_AUTO_RESTART=0` if you would rather choose the
moment.

Removing one:

```bash
node ace modules:uninstall <name> --confirm=<name> [--remove-folder]
```

This is the **only operation with no undo** — it drops the module's tables. `--remove-folder`
moves the directory to `shared/backups/` rather than deleting it. Take a database backup first
if you are not certain.

## Upgrading Driftless

```bash
cd /opt/driftless
git pull
npm ci
node ace migration:run --force
npm run release
# restart
```

If a release turns out to be bad: `npm run rollback`, then restart. The previous releases stay
on disk for exactly this.

## Checking it is healthy

- `http://your-site/health` — public. `{ ok, version }`. **503** means the database is
  unreachable or the built assets do not match their manifest. Point your monitoring here.
- `/api/admin/health` — logged in: database, asset state, safe mode, and any module that
  failed to start.

## Backups

Two things, and both matter:

1. **The database** — everything except uploaded files.
2. **`shared/`** — `storage/` holds digital products your customers have paid for, `uploads/`
   holds your media library, `.env` holds your keys.

`releases/` and `node_modules/` do not need backing up; they rebuild from the checkout.

## When something breaks

[RECOVERY.md](./RECOVERY.md) — safe mode, disabling a module from a shell, rolling back a
release. All of it works without the application booting, because that is when you need it.
