import type { LocalStore } from "./local-store";
import type {
  EntityName,
  LocalRow,
  OutboxJob,
  OutboxStatus,
  SyncMeta,
  SyncOp,
} from "./schema";

/**
 * No-op store used when offline mode is disabled (env flag). Every call
 * is a harmless noop so callers never branch on capability; mutations
 * still go through the existing online-only API hooks.
 */
export class NullLocalStore implements LocalStore {
  readonly mode = "disabled" as const;
  readonly namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  async ready(): Promise<void> {}
  async close(): Promise<void> {}

  async getAll<TData>(_entity: EntityName): Promise<LocalRow<TData>[]> {
    return [];
  }
  async getById<TData>(
    _entity: EntityName,
    _id: string,
  ): Promise<LocalRow<TData> | null> {
    return null;
  }
  async putServerRows(): Promise<void> {}
  async upsertLocal<TData>(
    _entity: EntityName,
    row: { id: string; data: TData },
    _op: Extract<SyncOp, "create" | "update">,
  ): Promise<LocalRow<TData>> {
    return {
      id: row.id,
      data: row.data,
      _sync: {
        synced: true,
        syncedAt: new Date().toISOString(),
        pendingSince: null,
        deleted: false,
        baseUpdatedAt: null,
        localOp: null,
        lastError: null,
        conflict: false,
      },
    };
  }
  async softDeleteLocal(): Promise<void> {}
  async markSynced(): Promise<void> {}
  async setRowMeta(
    _entity: EntityName,
    _id: string,
    _patch: Partial<SyncMeta>,
  ): Promise<void> {}
  async deleteRow(): Promise<void> {}
  async enqueueJob(): Promise<number> {
    return -1;
  }
  async listDueJobs(): Promise<OutboxJob[]> {
    return [];
  }
  async listAllJobs(): Promise<OutboxJob[]> {
    return [];
  }
  async updateJob(): Promise<void> {}
  async deleteJob(): Promise<void> {}
  async countJobsByStatus(): Promise<Record<OutboxStatus, number>> {
    return { idle: 0, running: 0, error: 0, conflict: 0 };
  }
  async clearAll(): Promise<void> {}
}
