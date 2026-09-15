# Railway / fresh-clone build gotchas

Four things break a Railway (Railpack) build that a **macOS working-tree `npm run build`
never reproduces**, so they were missed until a real deploy. If you touch the build, deploy
config, Node version, or `.adonisjs` codegen, read this. Human-facing walkthrough:
[../RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md).

## How to reproduce a Railway build locally (do this, don't trust a macOS build)

A macOS build hides these because the dev machine runs a safe Node and its working tree already
has dev-generated, gitignored files. Reproduce Railway faithfully in a clean Linux container off
a `git archive`:

```sh
git archive main | tar -x -C /tmp/repro && cd /tmp/repro
docker run --rm -v /tmp/repro:/app node:24.21.0-slim bash -c '
  cd /app && export NODE_ENV=production npm_config_production=false \
    APP_KEY=... APP_URL=http://localhost:3333 DATABASE_URL=postgres://u:p@localhost:5432/d \
    HOST=0.0.0.0 LOG_LEVEL=info PORT=3333 SESSION_DRIVER=cookie LIMITER_STORE=redis \
    STORAGE_DRIVER=s3 S3_BUCKET=x S3_ACCESS_KEY_ID=x S3_SECRET_ACCESS_KEY=x \
    S3_ENDPOINT=https://x.r2.cloudflarestorage.com S3_REGION=auto TZ=UTC
  npm install && npm run build'
```

Swap the image tag to test a Node version (`node:24.19.0-slim` = good, `node:24.21.0-slim` =
reproduces the "Invalid URL" crash below).

## 1. Node 24.20.0 / 24.21.0 crash every `node ace` call

`node ace` (build's `mcp:catalog`, Pre-Deploy `migration:run`, runtime `queue:work` /
`modules:maintenance`) boots the ace kernel, which validates every command's metadata through the
`jsonschema` lib. On Node **24.20.0 and 24.21.0** an `ada`-url regression makes
`new URL('/x', 'thismessage::/')` (opaque base, no fragment) throw, so validation dies with a
misleading `RuntimeException: Invalid command exported from "analytics_prune.js" file. Invalid URL`
— the first-scanned command takes the blame; the file is fine. Safe on 24.19.0, 22.x, 25.9+.

Fix: `.node-version` + `.nvmrc` pin **24.19.0**; also set `RAILPACK_NODE_VERSION=24.19.0` per
service (Railpack otherwise installs the newest 24 LTS = broken range). This is not build-only —
it also protects the worker/cron/migration `node ace` calls at runtime.

## 2. `.adonisjs/client/registry/` must be committed

Vite resolves `@generated/registry` → `.adonisjs/client/registry/`. That dir is written **only**
by the dev server's route scanner (`generateRegistry()` fires on the `routesScanned` event, which
the assembler emits from its **DevServer** class, never from the **Bundler** that backs
`node ace build`). So a fresh clone has no copy and the Vite build fails
`Could not load .../.adonisjs/client//registry`. It is committed (the rest of `.adonisjs/` stays
ignored via a `.gitignore` negation). Regenerate with `npm run dev` once + recommit when routes
change, else the deployed typed client is stale (doesn't fail the build).

## 3. Build Command must be `npm install`, not `npm ci`

Railpack caches `node_modules` (incl. `node_modules/.vite`) across builds via a mount. `npm ci`
starts by `rm -rf node_modules`, which fails on that mount with
`EBUSY: resource busy or locked, rmdir '/app/node_modules/.vite'`. `npm install` reconciles in
place and coexists with the cache. Lockfile still respected.

## 4. `npm_config_production=false` prefix is required

`NODE_ENV=production` is a required runtime var and is also set during the build; npm reads it and
skips devDependencies (the whole TS/Vite/Tailwind toolchain) for both `npm install` and `npm ci`.
Without the prefix the build fails with an obscure `Cannot find module '.../@poppinss/ts-exec/...'`.
So the full Build Command is `npm_config_production=false npm install && npm run build`.
