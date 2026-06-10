---
name: driftless-dev
description: Local dev setup, migrations, seeding, and CMS workflows for Driftless. Use when starting the app, fixing dev/Vite errors, running migrations, or adding CMS/admin features.
---

# Driftless development

## Setup (fresh machine)

```bash
docker compose up -d
cp .env.example .env
# APP_KEY: node ace generate:key
node ace migration:run
node ace db:seed
npm install
npm run dev
```

Verify `DATABASE_URL` uses port **5433** and database name **driftless**.

## Fix Vite manifest error in dev

If Inertia shows *Cannot read the manifest file when running in dev mode*:

```bash
rm -f public/assets/.vite/manifest.json
npm run dev
```

## Reset admin password (dev)

```bash
FORCE_SEED_PASSWORD=1 node ace db:seed
```

Requires quoted `SEED_ADMIN_PASSWORD` in `.env` if password contains `#`.

## Migrate from legacy stack

Follow [docs/LEGACY_MIGRATION.md](../../../docs/LEGACY_MIGRATION.md) only — do not improvise steps.

```bash
LEGACY_DATABASE_URL=... DRIFTLESS_DATABASE_URL=... node ace migrate:from-legacy
node ace db:seed
```

## Add admin feature checklist

1. Route in `start/routes.ts` with `auth()` + `permission` middleware
2. `app/controllers/admin/*` — page + API methods
3. `app/services/*` for business logic
4. `inertia/pages/admin/*` and/or `inertia/hooks/api/*`
5. `npm run typecheck`

## Add CMS collection (dynamic)

1. API: `cms_controller` + `cms_service` (or extend existing endpoints)
2. UI: `inertia/pages/admin/cms/collections*` and `records*`
3. Permissions: `cms:manage` for schema; `cms:{key}:*` for records
4. See [docs/ai/cms.md](../../../docs/ai/cms.md)

## Verify before done

```bash
npm run typecheck
npm run lint
npm test
```

## Reference

- Hub: [AGENTS.md](../../../AGENTS.md)
- Docs: [docs/ai/](../../../docs/ai/)
