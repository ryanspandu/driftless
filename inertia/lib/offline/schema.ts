/**
 * Offline domain types shared by every storage backend (Dexie, memory, null).
 *
 * The UI never touches these directly — it uses `toSyncStatus()` from
 * `./sync-status` to feed the DataTable's Sync column.
 */

/**
 * Entity namespace used to partition offline rows and outbox jobs.
 *
 * Native entities (`users`, `content`) live in their own Dexie tables.
 * Dynamic CMS collections use the `cms:<collectionKey>` format and share a
 * single `cmsRecords` table keyed by `[entity+id]`.
 */
export type EntityName = "users" | "content" | `cms:${string}`;

/** True for any dynamic CMS collection entity. */
export function isCmsEntity(entity: string): entity is `cms:${string}` {
  return entity.startsWith("cms:");
}

/** Build a `cms:<key>` entity identifier. */
export function cmsEntity(collectionKey: string): `cms:${string}` {
  return `cms:${collectionKey}`;
}

export type SyncOp = "create" | "update" | "delete";

/**
 * Metadata attached to every row stored locally. It tracks the outbox
 * lifecycle (pending / synced / conflict / error) and the server baseline
 * used for Last-Write-Wins conflict detection.
 */
export interface SyncMeta {
  /** True when the row is known to match the server version. */
  synced: boolean;
  /** ISO timestamp of the last successful sync with the server. */
  syncedAt: string | null;
  /**
   * ISO timestamp captured when a local mutation was queued. While set, the
   * row is considered "pending" and the UI renders the amber CloudOff icon.
   */
  pendingSince: string | null;
  /** Soft-delete flag. Kept until the matching delete job syncs. */
  deleted: boolean;
  /** Server-side `updatedAt` captured at read time, used for LWW checks. */
  baseUpdatedAt: string | null;
  /** Last local operation that produced the pending state (if any). */
  localOp: SyncOp | null;
  /** Non-retryable error surfaced in the Sync Center ("conflict" stops retries). */
  lastError: string | null;
  /**
   * Flag set when the server reported a concurrent update. User must
   * resolve before the outbox drains.
   */
  conflict: boolean;
}

export function freshSyncMeta(): SyncMeta {
  return {
    synced: false,
    syncedAt: null,
    pendingSince: null,
    deleted: false,
    baseUpdatedAt: null,
    localOp: null,
    lastError: null,
    conflict: false,
  };
}

/**
 * Envelope used by local stores. `data` contains the entity as returned
 * by the server (ContentDto / UserDto), `_sync` is local-only metadata.
 */
export interface LocalRow<TData> {
  id: string;
  data: TData;
  _sync: SyncMeta;
}

export type OutboxStatus = "idle" | "running" | "error" | "conflict";

export interface OutboxJob<TPayload = unknown> {
  /** Auto-increment id assigned by the store. */
  id: number;
  entity: EntityName;
  op: SyncOp;
  /** Local ULID of the row the job belongs to. */
  refId: string;
  /** Body to send to the API (without any `_sync` fields). */
  payload: TPayload;
  /** Server `updatedAt` captured when the mutation was queued (used for LWW). */
  baseUpdatedAt: string | null;
  attempts: number;
  status: OutboxStatus;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
}

export interface PersistedMeta {
  /** e.g. "schemaVersion", "lastFullSync:<entity>", "userId" */
  key: string;
  value: string | number | null;
}
