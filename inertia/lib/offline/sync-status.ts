import type { SyncStatus } from "~/components/data-table";
import type { LocalRow, SyncMeta } from "./schema";

/**
 * Adapter from the offline row envelope to the shape consumed by the
 * DataTable's Sync column. Conflict is surfaced as "not synced" so the
 * amber icon fires, and the detailed state lives in the Sync Center.
 */
export function toSyncStatus(meta: SyncMeta): SyncStatus {
  return {
    synced: meta.synced && !meta.pendingSince && !meta.conflict,
    syncedAt: meta.syncedAt,
    pendingSince: meta.pendingSince,
  };
}

/**
 * Convenience helper — lets callers pass `row` directly to DataTable's
 * `getSyncStatus` prop when rows are `LocalRow<TData>`.
 */
export function syncStatusOf<TData>(row: LocalRow<TData>): SyncStatus {
  return toSyncStatus(row._sync);
}
