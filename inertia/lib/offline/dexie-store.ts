
import Dexie, { type Table } from "dexie";
import type { LocalStore } from "./local-store";
import { storageKeyForSyncedRow } from "./row-key";
import {
  freshSyncMeta,
  isCmsEntity,
  type EntityName,
  type LocalRow,
  type OutboxJob,
  type OutboxStatus,
  type SyncMeta,
  type SyncOp,
} from "./schema";

const SCHEMA_VERSION = 2;

type StoredRow = {
  id: string;
  data: unknown;
  _sync: SyncMeta;
};

/** Shape stored in the shared `cmsRecords` table. Key is `[entity+id]`. */
type CmsStoredRow = StoredRow & { entity: string };

class DriftlessDB extends Dexie {
  users!: Table<StoredRow, string>;
  content!: Table<StoredRow, string>;
  /**
   * Shared table for every dynamic CMS collection. The compound primary key
   * `[entity+id]` keeps rows from different collections disjoint while the
   * `entity` index supports bulk lookups (`getAll`, `clear`).
   */
  cmsRecords!: Table<CmsStoredRow, [string, string]>;
  outbox!: Table<OutboxJob, number>;
  meta!: Table<{ key: string; value: string | number | null }, string>;

  constructor(dbName: string) {
    super(dbName);
    // v1 — legacy layout without `cmsRecords`.
    this.version(1).stores({
      users: "id",
      content: "id",
      outbox: "++id,entity,status,nextAttemptAt",
      meta: "key",
    });
    // v2 — add the shared CMS records table for dynamic collections.
    this.version(SCHEMA_VERSION).stores({
      users: "id",
      content: "id",
      cmsRecords: "[entity+id],entity",
      outbox: "++id,entity,status,nextAttemptAt",
      meta: "key",
    });
  }
}

export class DexieLocalStore implements LocalStore {
  readonly mode = "idb" as const;
  readonly namespace: string;
  private readonly db: DriftlessDB;

  constructor(namespace: string) {
    this.namespace = namespace;
    this.db = new DriftlessDB(`driftless:${namespace}`);
  }

  async ready(): Promise<void> {
    await this.db.open();
    await this.db.meta.put({ key: "schemaVersion", value: SCHEMA_VERSION });
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private nativeTable(entity: "users" | "content"): Table<StoredRow, string> {
    return entity === "users" ? this.db.users : this.db.content;
  }

  async getAll<TData>(entity: EntityName): Promise<LocalRow<TData>[]> {
    if (isCmsEntity(entity)) {
      const rows = await this.db.cmsRecords
        .where("entity")
        .equals(entity)
        .toArray();
      return rows.map((r) => ({
        id: r.id,
        data: r.data as TData,
        _sync: r._sync,
      }));
    }
    const rows = await this.nativeTable(entity).toArray();
    return rows.map((r) => ({
      id: r.id,
      data: r.data as TData,
      _sync: r._sync,
    }));
  }

  async getById<TData>(
    entity: EntityName,
    id: string,
  ): Promise<LocalRow<TData> | null> {
    const row = isCmsEntity(entity)
      ? await this.db.cmsRecords.get([entity, id])
      : await this.nativeTable(entity).get(id);
    if (!row) return null;
    return { id: row.id, data: row.data as TData, _sync: row._sync };
  }

  async putServerRows<TData>(
    entity: EntityName,
    rows: Array<{ id: string; data: TData; serverUpdatedAt: string }>,
  ): Promise<void> {
    if (isCmsEntity(entity)) {
      await this.db.transaction("rw", this.db.cmsRecords, async () => {
        const serverIds = new Set(rows.map((r) => r.id));
        for (const r of rows) {
          const existing = await this.db.cmsRecords.get([entity, r.id]);
          if (existing && existing._sync.pendingSince) {
            await this.db.cmsRecords.put({
              entity,
              id: r.id,
              data: existing.data,
              _sync: {
                ...existing._sync,
                baseUpdatedAt: r.serverUpdatedAt,
              },
            });
            continue;
          }
          await this.db.cmsRecords.put({
            entity,
            id: r.id,
            data: r.data,
            _sync: {
              ...freshSyncMeta(),
              synced: true,
              syncedAt: new Date().toISOString(),
              baseUpdatedAt: r.serverUpdatedAt,
            },
          });
        }
        const all = await this.db.cmsRecords
          .where("entity")
          .equals(entity)
          .toArray();
        for (const row of all) {
          const d = row.data as { id?: string } | null;
          if (!d || typeof d.id !== "string") continue;
          if (row.id !== d.id && serverIds.has(d.id)) {
            await this.db.cmsRecords.delete([entity, row.id]);
          }
        }
      });
      return;
    }

    const table = this.nativeTable(entity);
    await this.db.transaction("rw", table, async () => {
      const serverIds = new Set(rows.map((r) => r.id));
      for (const r of rows) {
        const existing = await table.get(r.id);
        if (existing && existing._sync.pendingSince) {
          await table.put({
            id: r.id,
            data: existing.data,
            _sync: {
              ...existing._sync,
              baseUpdatedAt: r.serverUpdatedAt,
            },
          });
          continue;
        }
        await table.put({
          id: r.id,
          data: r.data,
          _sync: {
            ...freshSyncMeta(),
            synced: true,
            syncedAt: new Date().toISOString(),
            baseUpdatedAt: r.serverUpdatedAt,
          },
        });
      }
      const all = await table.toArray();
      for (const row of all) {
        const d = row.data as { id?: string } | null;
        if (!d || typeof d.id !== "string") continue;
        if (row.id !== d.id && serverIds.has(d.id)) {
          await table.delete(row.id);
        }
      }
    });
  }

  async upsertLocal<TData>(
    entity: EntityName,
    row: { id: string; data: TData },
    op: Extract<SyncOp, "create" | "update">,
  ): Promise<LocalRow<TData>> {
    const now = new Date().toISOString();
    if (isCmsEntity(entity)) {
      const existing = await this.db.cmsRecords.get([entity, row.id]);
      const baseUpdatedAt = existing?._sync.baseUpdatedAt ?? null;
      const next: CmsStoredRow = {
        entity,
        id: row.id,
        data: row.data,
        _sync: {
          ...freshSyncMeta(),
          ...(existing?._sync ?? {}),
          synced: false,
          pendingSince: now,
          localOp: op,
          baseUpdatedAt,
          lastError: null,
          conflict: false,
          deleted: false,
        },
      };
      await this.db.cmsRecords.put(next);
      return { id: next.id, data: next.data as TData, _sync: next._sync };
    }

    const table = this.nativeTable(entity);
    const existing = await table.get(row.id);
    const baseUpdatedAt = existing?._sync.baseUpdatedAt ?? null;
    const next: StoredRow = {
      id: row.id,
      data: row.data,
      _sync: {
        ...freshSyncMeta(),
        ...(existing?._sync ?? {}),
        synced: false,
        pendingSince: now,
        localOp: op,
        baseUpdatedAt,
        lastError: null,
        conflict: false,
        deleted: false,
      },
    };
    await table.put(next);
    return { id: next.id, data: next.data as TData, _sync: next._sync };
  }

  async softDeleteLocal(entity: EntityName, id: string): Promise<void> {
    const now = new Date().toISOString();
    if (isCmsEntity(entity)) {
      const existing = await this.db.cmsRecords.get([entity, id]);
      if (!existing) return;
      await this.db.cmsRecords.put({
        ...existing,
        _sync: {
          ...existing._sync,
          deleted: true,
          pendingSince: now,
          localOp: "delete",
          synced: false,
          conflict: false,
          lastError: null,
        },
      });
      return;
    }
    const table = this.nativeTable(entity);
    const existing = await table.get(id);
    if (!existing) return;
    await table.put({
      id,
      data: existing.data,
      _sync: {
        ...existing._sync,
        deleted: true,
        pendingSince: now,
        localOp: "delete",
        synced: false,
        conflict: false,
        lastError: null,
      },
    });
  }

  async markSynced<TData>(
    entity: EntityName,
    id: string,
    data: TData,
    serverUpdatedAt: string,
  ): Promise<void> {
    const targetId = storageKeyForSyncedRow(id, data);
    const now = new Date().toISOString();
    if (isCmsEntity(entity)) {
      await this.db.transaction("rw", this.db.cmsRecords, async () => {
        if (targetId !== id) {
          await this.db.cmsRecords.delete([entity, id]);
        }
        await this.db.cmsRecords.put({
          entity,
          id: targetId,
          data,
          _sync: {
            ...freshSyncMeta(),
            synced: true,
            syncedAt: now,
            baseUpdatedAt: serverUpdatedAt,
          },
        });
      });
      return;
    }
    const table = this.nativeTable(entity);
    await this.db.transaction("rw", table, async () => {
      if (targetId !== id) {
        await table.delete(id);
      }
      await table.put({
        id: targetId,
        data,
        _sync: {
          ...freshSyncMeta(),
          synced: true,
          syncedAt: now,
          baseUpdatedAt: serverUpdatedAt,
        },
      });
    });
  }

  async setRowMeta(
    entity: EntityName,
    id: string,
    patch: Partial<SyncMeta>,
  ): Promise<void> {
    if (isCmsEntity(entity)) {
      const existing = await this.db.cmsRecords.get([entity, id]);
      if (!existing) return;
      await this.db.cmsRecords.put({
        ...existing,
        _sync: { ...existing._sync, ...patch },
      });
      return;
    }
    const table = this.nativeTable(entity);
    const existing = await table.get(id);
    if (!existing) return;
    await table.put({
      id,
      data: existing.data,
      _sync: { ...existing._sync, ...patch },
    });
  }

  async deleteRow(entity: EntityName, id: string): Promise<void> {
    if (isCmsEntity(entity)) {
      await this.db.cmsRecords.delete([entity, id]);
      return;
    }
    await this.nativeTable(entity).delete(id);
  }

  async enqueueJob<TPayload>(
    job: Omit<OutboxJob<TPayload>, "id">,
  ): Promise<number> {
    return this.db.outbox.add(job as OutboxJob) as Promise<number>;
  }

  async listDueJobs(now: Date = new Date()): Promise<OutboxJob[]> {
    const iso = now.toISOString();
    return this.db.outbox
      .where("status")
      .equals("idle")
      .and((j) => j.nextAttemptAt <= iso)
      .sortBy("createdAt");
  }

  async listAllJobs(): Promise<OutboxJob[]> {
    return this.db.outbox.orderBy("id").toArray();
  }

  async updateJob(
    id: number,
    patch: Partial<Pick<OutboxJob, "status" | "attempts" | "nextAttemptAt" | "lastError">>,
  ): Promise<void> {
    await this.db.outbox.update(id, patch);
  }

  async deleteJob(id: number): Promise<void> {
    await this.db.outbox.delete(id);
  }

  async countJobsByStatus(): Promise<Record<OutboxStatus, number>> {
    const out: Record<OutboxStatus, number> = {
      idle: 0,
      running: 0,
      error: 0,
      conflict: 0,
    };
    await this.db.outbox.each((j) => {
      out[j.status] = (out[j.status] ?? 0) + 1;
    });
    return out;
  }

  private async findIdleCreateJob(
    entity: EntityName,
    refId: string,
  ): Promise<OutboxJob | undefined> {
    return this.db.outbox
      .where("entity")
      .equals(entity)
      .and((j) => j.refId === refId && j.op === "create" && j.status === "idle")
      .first();
  }

  async mergePendingCreatePayload(
    entity: EntityName,
    refId: string,
    partial: Record<string, unknown>,
  ): Promise<boolean> {
    const job = await this.findIdleCreateJob(entity, refId);
    if (!job) return false;
    const payload = { ...(job.payload as Record<string, unknown>) };
    for (const [k, v] of Object.entries(partial)) {
      if (v !== undefined) payload[k] = v;
    }
    await this.db.outbox.update(job.id, { payload });
    return true;
  }

  async dropPendingCreate(entity: EntityName, refId: string): Promise<boolean> {
    const job = await this.findIdleCreateJob(entity, refId);
    if (!job) return false;
    await this.db.outbox.delete(job.id);
    return true;
  }

  async repointJobs(
    entity: EntityName,
    fromRefId: string,
    toRefId: string,
  ): Promise<void> {
    if (fromRefId === toRefId) return;
    const jobs = await this.db.outbox
      .where("entity")
      .equals(entity)
      .and((j) => j.refId === fromRefId)
      .toArray();
    for (const j of jobs) {
      await this.db.outbox.update(j.id, { refId: toRefId });
    }
  }

  async dropJobsForRow(entity: EntityName, refId: string): Promise<number> {
    const jobs = await this.db.outbox
      .where("entity")
      .equals(entity)
      .and((j) => j.refId === refId)
      .toArray();
    for (const j of jobs) {
      await this.db.outbox.delete(j.id);
    }
    return jobs.length;
  }

  async clearAll(): Promise<void> {
    await Promise.all([
      this.db.users.clear(),
      this.db.content.clear(),
      this.db.cmsRecords.clear(),
      this.db.outbox.clear(),
      this.db.meta.clear(),
    ]);
  }
}
