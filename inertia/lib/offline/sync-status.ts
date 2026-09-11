import type { SyncStatus } from "~/components/data-table";
import type { LocalRow, SyncMeta } from "./schema";

/**
 * Adapter from the offline row envelope to the shape consumed by the
 * DataTable's Sync column. A conflict reads as "not synced" but also carries
 * the `conflict` flag + `error` message so the column can render a distinct
 * warning state and the row actions can offer discard / recreate.
 */
export function toSyncStatus(meta: SyncMeta): SyncStatus {
  return {
    synced: meta.synced && !meta.pendingSince && !meta.conflict,
    syncedAt: meta.syncedAt,
    pendingSince: meta.pendingSince,
    conflict: meta.conflict,
    error: meta.lastError,
  };
}

/**
 * Convenience helper — lets callers pass `row` directly to DataTable's
 * `getSyncStatus` prop when rows are `LocalRow<TData>`.
 */
export function syncStatusOf<TData>(row: LocalRow<TData>): SyncStatus {
  return toSyncStatus(row._sync);
}
