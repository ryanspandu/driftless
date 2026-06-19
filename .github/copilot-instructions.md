# GitHub Copilot — Driftless

Read **[AGENTS.md](../AGENTS.md)** and **[docs/ai/](../docs/ai/)** for full project context.

## Stack

- **Backend:** AdonisJS 7, Lucid ORM, VineJS, session auth, PostgreSQL
- **Frontend:** Inertia.js, React 19, Vite, Tailwind CSS 4, TanStack Query
- **Features:** Dynamic CMS (collections/records/revisions), RBAC, Google OAuth, optional offline/PWA (Dexie + Serwist)

## Common tasks

| Task | Where to change |
|------|-----------------|
| New admin page | `start/routes.ts` → `app/controllers/admin/*` → `inertia/pages/admin/*.tsx` |
| New admin API | Route + controller + `app/services/*` + `inertia/hooks/api/*.ts` |
| Permission gate | `middleware.permission(...)` on route; check `permissions` on client |
| CMS collection | `cms_controller`, `cms_service`, pages under `inertia/pages/admin/cms/` |
| DB schema | `database/migrations/` + model in `app/models/` |
| Any table / list of data | Shared `DataTable` from `~/components/data-table` (see [docs/ai/frontend.md](../docs/ai/frontend.md#data-tables)) |

## Dev commands

```bash
npm run dev          # local with HMR
node ace migration:run && node ace db:seed
npm run typecheck
npm test
```

## Pitfalls

- Use `npm run dev`, not plain `node ace serve`.
- Stale Vite manifest: delete `public/assets/.vite/manifest.json` if Inertia manifest error in dev.
- `DATABASE_URL` must be the driftless database.
- Don't build custom tables — every table uses the shared `DataTable` (search top-left, filters beside it, uniform pagination footer).

## More

- [docs/ai/architecture.md](../docs/ai/architecture.md)
- [docs/ai/cms.md](../docs/ai/cms.md)
- [docs/LEGACY_MIGRATION.md](../docs/LEGACY_MIGRATION.md) (legacy stack migration)
