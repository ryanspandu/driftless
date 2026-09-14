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

## Outbox: create + follow-up edits (no orphaned conflicts)

A create gets a client ULID locally; the server returns its own id, so the row is re-keyed on
sync (`markSynced` + `row-key.ts`). To stop a follow-up edit/delete from orphaning onto the dead
local id (which would 404 → a stuck "conflict"):

- **Coalesce** (`use-offline-content.ts`, `use-offline-records.ts`): editing a row whose create is
  still queued folds the change into that queued create (`store.mergePendingCreatePayload`)
  instead of enqueuing a separate update; deleting one drops the queued create
  (`store.dropPendingCreate`) with no server round-trip.
- **Re-point** (`sync-engine.ts`): after a create syncs, queued jobs referencing the old local id
  are re-pointed to the server id (`store.repointJobs`, in the DB and the in-flight pass).
- **Reconcile** (`sync-engine.ts` `reconcileOrphanConflicts`, on start + every trigger): conflict
  jobs whose local row no longer exists are dropped (clears any pre-existing orphans). Genuine
  "record deleted on the server" conflicts (the edited row still exists) are kept.

`conflict` is only ever set for an **update that 404s** (`markGoneConflict`) or a handler that
classifies an error as `conflict` (HTTP 409). No app endpoint returns 409, so a create can never
be directly mis-classified.

## Pull sync: reconciling server-side deletions

`putServerRows` (`dexie-store.ts`, `memory-store.ts`) is the **pull** half of sync — called once
per collection/entity with the server's **full current row set** whenever a list hook
(`use-offline-records.ts`, `use-offline-content.ts`) refreshes. Its contract is a true
**replace**, not a plain upsert: after writing every row the server returned, it also removes any
locally-cached row for that entity whose id is **absent** from the server response — e.g. a
record someone else deleted. Before this, a deleted-elsewhere record stayed cached forever,
still rendering with a green "synced" checkmark (`toSyncStatus` only ever reads the local
`_sync` flag — it never re-verifies against the server on its own).

- **A row with an in-flight local change is left alone.** If `_sync.pendingSince` is set (a
  queued create/update/delete not yet pushed), the reconciliation loop skips it — it does **not**
  delete it and does **not** mark it conflicted itself. This matters two ways:
  - A still-queued **create** is *expected* to be absent from the server (it hasn't reached it
    yet) — touching it here would destroy the unsent row.
  - A queued **update** whose record was deleted server-side is left pending on purpose: when the
    outbox eventually pushes that job, the server 404s and the **existing** `markGoneConflict`
    path (above) flags it as a real, visible conflict. Deleting it here instead would silently
    discard the user's unsent edit with no trace.
- **Caller contract.** `rows` must be the entity's **full** current server-side set, not one page
  of it — a partial page would make this delete rows that are simply on a page the caller hasn't
  fetched yet. Both existing callers already satisfy this: `use-offline-records.ts` pages through
  the whole CMS collection before calling once; `use-offline-content.ts`'s `GET /api/admin/content`
  is unpaginated (`ContentService.findAll()`).
- **Tests:** `inertia/lib/offline/sync-reconcile.spec.ts` (Japa `client` suite, `MemoryLocalStore`
  — same pattern as `sync-clobber.spec.ts`) covers: a clean synced row the server dropped gets
  removed; a row with a pending update is left untouched; a row still pending its initial create
  is left untouched; a row still on the server is untouched (no unnecessary churn).

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
