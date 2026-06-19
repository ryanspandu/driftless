# Offline and PWA

Optional offline editing with local persistence and sync when back online.

## Enable / disable

- Env: `DISABLE_OFFLINE=1` in `.env` disables offline features. `vite.config.ts` injects it as `import.meta.env.VITE_DISABLE_OFFLINE`, which `inertia/lib/offline/capability.ts` reads.
- `detectStorageMode()` returns one of `idb` | `memory` | `disabled`. When disabled (or when IndexedDB is unavailable), Dexie is bypassed in favor of the in-memory store.

## Stack

| Piece | Location |
|-------|----------|
| Service worker | `inertia/sw.ts` → built to `public/sw.js` |
| Serwist | `vite.config.ts` plugin |
| Local DB | Dexie via `inertia/lib/offline/dexie-store.ts` |
| Sync engine | `inertia/lib/offline/sync-engine.ts` |
| Handlers | `inertia/lib/offline/handlers/*` (content, users, cms-record) |
| Hooks | `inertia/hooks/offline/*` |

Production registers SW in `inertia/app.tsx` via `virtual:serwist`.

## User flows

- Offline fallback page: `GET /offline` → `inertia/pages/offline.tsx`.
- Edits queue locally; sync drains outbox when network returns.
- UI: sync status components, overlay hooks.

## Build notes

- Serwist `globDirectory` points at `public/assets` (dev) or `build/public/assets` (production).
- Ignores: `uploads`, `.vite`, `sw.js` in vite config.

## Testing offline

1. Build or run dev with offline enabled (`DISABLE_OFFLINE` unset).
2. Create/edit CMS or content records.
3. Disable network → confirm local edits persist.
4. Re-enable network → verify sync completes.

## Related

- [frontend.md](./frontend.md)
- [dev-workflow.md](./dev-workflow.md)
- [LEGACY_MIGRATION.md](../LEGACY_MIGRATION.md) (PWA verification in migration checklist)
