import type { LocalStore } from "./local-store";
import { storageKeyForSyncedRow } from "./row-key";
import {
  freshSyncMeta,
  type EntityName,
  type LocalRow,
  type OutboxJob,
  type OutboxStatus,
  type SyncMeta,
  type SyncOp,
} from "./schema";

type StoredRow<TData = unknown> = {
  id: string;
  data: TData;
  _sync: SyncMeta;
};

/**
 * Fallback store used when IndexedDB is unavailable (private mode, corporate
 * policy, Safari ITP purge). Data lives for the tab session only — the
 * admin shell surfaces a banner so the user knows drafts won't survive a
 * reload.
 */
export class MemoryLocalStore implements LocalStore {
  readonly mode = "memory" as const;
  readonly namespace: string;

  /**
   * Keyed by entity name (`users`, `content`, or `cms:<collectionKey>`).
   * Auto-vivified on first access so dynamic CMS collections work.
   */
  private readonly tables: Map<string, Map<string, StoredRow>> = new Map();
  private readonly jobs: OutboxJob[] = [];
  private jobSeq = 1;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  private tableFor(entity: EntityName): Map<string, StoredRow> {
    let t = this.tables.get(entity);
    if (!t) {
      t = new Map<string, StoredRow>();
      this.tables.set(entity, t);
    }
    return t;
  }

  async ready(): Promise<void> {
    /* no-op */
  }

  async close(): Promise<void> {
    /* no-op */
  }

  async getAll<TData>(entity: EntityName): Promise<LocalRow<TData>[]> {
    return Array.from(this.tableFor(entity).values()).map((r) => ({
      id: r.id,
      data: r.data as TData,
      _sync: r._sync,
    }));
  }

  async getById<TData>(
    entity: EntityName,
    id: string,
  ): Promise<LocalRow<TData> | null> {
    const r = this.tableFor(entity).get(id);
    if (!r) return null;
    return { id: r.id, data: r.data as TData, _sync: r._sync };
  }

  async putServerRows<TData>(
    entity: EntityName,
    rows: Array<{ id: string; data: TData; serverUpdatedAt: string }>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const serverIds = new Set(rows.map((r) => r.id));
    const m = this.tableFor(entity);
    for (const r of rows) {
      const existing = m.get(r.id);
      if (existing && existing._sync.pendingSince) {
        existing._sync = { ...existing._sync, baseUpdatedAt: r.serverUpdatedAt };
        continue;
      }
      m.set(r.id, {
        id: r.id,
        data: r.data,
        _sync: {
          ...freshSyncMeta(),
          synced: true,
          syncedAt: now,
          baseUpdatedAt: r.serverUpdatedAt,
        },
      });
    }
    for (const [key, row] of m) {
      const d = row.data as { id?: string } | null;
      if (!d || typeof d.id !== "string") continue;
      if (key !== d.id && serverIds.has(d.id)) {
        m.delete(key);
      }
    }
  }

  async upsertLocal<TData>(
    entity: EntityName,
    row: { id: string; data: TData },
    op: Extract<SyncOp, "create" | "update">,
  ): Promise<LocalRow<TData>> {
    const now = new Date().toISOString();
    const m = this.tableFor(entity);
    const existing = m.get(row.id);
    const next: StoredRow = {
      id: row.id,
      data: row.data,
      _sync: {
        ...freshSyncMeta(),
        ...(existing?._sync ?? {}),
        synced: false,
        pendingSince: now,
        localOp: op,
        baseUpdatedAt: existing?._sync.baseUpdatedAt ?? null,
        lastError: null,
        conflict: false,
        deleted: false,
      },
    };
    m.set(row.id, next);
    return { id: next.id, data: next.data as TData, _sync: next._sync };
  }

  async softDeleteLocal(entity: EntityName, id: string): Promise<void> {
    const existing = this.tableFor(entity).get(id);
    if (!existing) return;
    existing._sync = {
      ...existing._sync,
      deleted: true,
      pendingSince: new Date().toISOString(),
      localOp: "delete",
      synced: false,
      conflict: false,
      lastError: null,
    };
  }

  async markSynced<TData>(
    entity: EntityName,
    id: string,
    data: TData,
    serverUpdatedAt: string,
  ): Promise<void> {
    const targetId = storageKeyForSyncedRow(id, data);
    const m = this.tableFor(entity);
    if (targetId !== id) {
      m.delete(id);
    }
    m.set(targetId, {
      id: targetId,
      data,
      _sync: {
        ...freshSyncMeta(),
        synced: true,
        syncedAt: new Date().toISOString(),
        baseUpdatedAt: serverUpdatedAt,
      },
    });
  }

  async setRowMeta(
    entity: EntityName,
    id: string,
    patch: Partial<SyncMeta>,
  ): Promise<void> {
    const existing = this.tableFor(entity).get(id);
    if (!existing) return;
    existing._sync = { ...existing._sync, ...patch };
  }

  async deleteRow(entity: EntityName, id: string): Promise<void> {
    this.tableFor(entity).delete(id);
  }

  async enqueueJob<TPayload>(
    job: Omit<OutboxJob<TPayload>, "id">,
  ): Promise<number> {
    const id = this.jobSeq++;
    this.jobs.push({ ...(job as OutboxJob), id });
    return id;
  }

  async listDueJobs(now: Date = new Date()): Promise<OutboxJob[]> {
    const iso = now.toISOString();
    return this.jobs
      .filter((j) => j.status === "idle" && j.nextAttemptAt <= iso)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listAllJobs(): Promise<OutboxJob[]> {
    return [...this.jobs].sort((a, b) => a.id - b.id);
  }

  async updateJob(
    id: number,
    patch: Partial<Pick<OutboxJob, "status" | "attempts" | "nextAttemptAt" | "lastError">>,
  ): Promise<void> {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    Object.assign(job, patch);
  }

  async deleteJob(id: number): Promise<void> {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx >= 0) this.jobs.splice(idx, 1);
  }

  async countJobsByStatus(): Promise<Record<OutboxStatus, number>> {
    const out: Record<OutboxStatus, number> = {
      idle: 0,
      running: 0,
      error: 0,
      conflict: 0,
    };
    for (const j of this.jobs) out[j.status]++;
    return out;
  }

  private findIdleCreateJob(
    entity: EntityName,
    refId: string,
  ): OutboxJob | undefined {
    return this.jobs.find(
      (j) =>
        j.entity === entity &&
        j.refId === refId &&
        j.op === "create" &&
        j.status === "idle",
    );
  }

  async mergePendingCreatePayload(
    entity: EntityName,
    refId: string,
    partial: Record<string, unknown>,
  ): Promise<boolean> {
    const job = this.findIdleCreateJob(entity, refId);
    if (!job) return false;
    const payload = { ...(job.payload as Record<string, unknown>) };
    for (const [k, v] of Object.entries(partial)) {
      if (v !== undefined) payload[k] = v;
    }
    job.payload = payload;
    return true;
  }

  async dropPendingCreate(entity: EntityName, refId: string): Promise<boolean> {
    const job = this.findIdleCreateJob(entity, refId);
    if (!job) return false;
    const idx = this.jobs.indexOf(job);
    if (idx >= 0) this.jobs.splice(idx, 1);
    return true;
  }

  async repointJobs(
    entity: EntityName,
    fromRefId: string,
    toRefId: string,
  ): Promise<void> {
    if (fromRefId === toRefId) return;
    for (const j of this.jobs) {
      if (j.entity === entity && j.refId === fromRefId) j.refId = toRefId;
    }
  }

  async dropJobsForRow(entity: EntityName, refId: string): Promise<number> {
    let removed = 0;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      if (j.entity === entity && j.refId === refId) {
        this.jobs.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }

  async clearAll(): Promise<void> {
    this.tables.clear();
    this.jobs.length = 0;
    this.jobSeq = 1;
  }
}
