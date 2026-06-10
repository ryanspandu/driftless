import type {
  EntityName,
  LocalRow,
  OutboxJob,
  OutboxStatus,
  SyncMeta,
  SyncOp,
} from "./schema";

/**
 * Storage-agnostic contract used by hooks and the sync engine.
 *
 * Every method is async to keep the Dexie / memory implementations
 * interchangeable. A `disabled` (no-op) store implements the same
 * interface but returns empty values so callers don't branch.
 */
export interface LocalStore {
  readonly mode: "idb" | "memory" | "disabled";

  /** Namespace helper, e.g. "driftless:<userHash>". */
  readonly namespace: string;

  /** Idempotent — safe to call on every boot. */
  ready(): Promise<void>;

  /** Release resources when the user logs out / switches account. */
  close(): Promise<void>;

  getAll<TData>(entity: EntityName): Promise<LocalRow<TData>[]>;
  getById<TData>(entity: EntityName, id: string): Promise<LocalRow<TData> | null>;

  /** Bulk replace rows coming from the server. Does not touch pending rows. */
  putServerRows<TData>(
    entity: EntityName,
    rows: Array<{ id: string; data: TData; serverUpdatedAt: string }>,
  ): Promise<void>;

  /** Apply a local create/update. Sets `_sync.pendingSince` + `localOp`. */
  upsertLocal<TData>(
    entity: EntityName,
    row: { id: string; data: TData },
    op: Extract<SyncOp, "create" | "update">,
  ): Promise<LocalRow<TData>>;

  /** Soft-delete the row and queue the delete job. */
  softDeleteLocal(entity: EntityName, id: string): Promise<void>;

  /** Mark the row as fully synced with the server (outbox drained). */
  markSynced<TData>(
    entity: EntityName,
    id: string,
    data: TData,
    serverUpdatedAt: string,
  ): Promise<void>;

  /** Overwrite metadata to surface an error / conflict state in the UI. */
  setRowMeta(
    entity: EntityName,
    id: string,
    patch: Partial<SyncMeta>,
  ): Promise<void>;

  /** Remove the local row entirely (used after a successful delete sync). */
  deleteRow(entity: EntityName, id: string): Promise<void>;

  // ──────────────────────────────
  // Outbox
  // ──────────────────────────────

  enqueueJob<TPayload>(job: Omit<OutboxJob<TPayload>, "id">): Promise<number>;

  /** Jobs ready to run (`status === 'idle'` and `nextAttemptAt <= now`). */
  listDueJobs(now?: Date): Promise<OutboxJob[]>;

  /** Every job regardless of status — used by the Sync Center. */
  listAllJobs(): Promise<OutboxJob[]>;

  updateJob(
    id: number,
    patch: Partial<Pick<OutboxJob, "status" | "attempts" | "nextAttemptAt" | "lastError">>,
  ): Promise<void>;

  deleteJob(id: number): Promise<void>;

  countJobsByStatus(): Promise<Record<OutboxStatus, number>>;

  /** Drop everything; used on logout / account switch. */
  clearAll(): Promise<void>;
}
