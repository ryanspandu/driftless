
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ulid } from "ulid";
import type {
  CmsRecordDto,
  ContentStatus,
  CreateCmsRecordRequest,
  UpdateCmsRecordRequest,
} from "~/types/api";
import { useOffline } from "~/components/providers/offline-provider";
import { cmsRecords } from "~/lib/cms/client";
import {
  buildJob,
  cmsEntity,
  type LocalRow,
  type SyncMeta,
  DexieLocalStore,
  NullLocalStore,
} from "~/lib/offline";
import type {
  CmsCreatePayload,
  CmsDeletePayload,
  CmsUpdatePayload,
} from "~/lib/offline/handlers/cms-record-handler";

export interface OfflineCmsRow {
  id: string;
  data: CmsRecordDto;
  sync: SyncMeta;
}

export interface UseOfflineRecordsResult {
  rows: OfflineCmsRow[];
  isLoading: boolean;
  isFetching: boolean;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
  create: (input: CreateCmsRecordRequest) => Promise<void>;
  update: (id: string, patch: UpdateCmsRecordRequest) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Generic offline-first hook for every dynamic CMS collection.
 *
 * Mirrors `useOfflineContent` but routes through the `cms:*` wildcard
 * handler. The entity key in Dexie is `cms:<collectionKey>`, keeping rows
 * from different collections disjoint in the shared `cmsRecords` table.
 */
export function useOfflineRecords(
  collectionKey: string,
): UseOfflineRecordsResult {
  const { store, engine } = useOffline();
  
  const entity = useMemo(() => cmsEntity(collectionKey), [collectionKey]);
  const [isFetching, setIsFetching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [apiRows, setApiRows] = useState<CmsRecordDto[]>([]);
  const [bump, setBump] = useState(0);
  const refreshInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!collectionKey || refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    setIsFetching(true)
    try {
      const page = await cmsRecords.list(collectionKey, {
        pageSize: 100,
      });
      setApiRows(page.items);
      if (store && !(store instanceof NullLocalStore)) {
        await store.putServerRows(
          entity,
          page.items.map((r) => ({
            id: r.id,
            data: r,
            serverUpdatedAt: r.updatedAt,
          })),
        );
      }
      setBump((n) => n + 1);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[offline-records:${collectionKey}] refresh failed`,
          err,
        );
      }
    } finally {
      refreshInFlightRef.current = false
      setIsFetching(false);
      setHasLoaded(true);
    }
  }, [collectionKey, entity, store])

  useEffect(() => {
    if (!collectionKey) return
    void refresh()
  }, [collectionKey, refresh])

  const dexieRows = useLiveQuery(async () => {
    if (!store || !(store instanceof DexieLocalStore)) return null;
    return store.getAll<CmsRecordDto>(entity);
  }, [store, entity, bump]);

  const [memoryRows, setMemoryRows] = useState<LocalRow<CmsRecordDto>[]>([]);
  useEffect(() => {
    if (!store || store instanceof DexieLocalStore) return;
    let cancelled = false;
    void store.getAll<CmsRecordDto>(entity).then((rows) => {
      if (!cancelled) setMemoryRows(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [store, entity, bump]);

  const rows = useMemo<OfflineCmsRow[]>(() => {
    const syncedMeta = (): SyncMeta => ({
      synced: true,
      syncedAt: new Date().toISOString(),
      pendingSince: null,
      deleted: false,
      baseUpdatedAt: null,
      localOp: null,
      lastError: null,
      conflict: false,
    });

    if (!store || store instanceof NullLocalStore) {
      return apiRows
        .map((r) => ({ id: r.id, data: r, sync: syncedMeta() }))
        .sort((a, b) =>
          (b.data.updatedAt ?? "").localeCompare(a.data.updatedAt ?? ""),
        );
    }

    const source =
      store instanceof DexieLocalStore ? dexieRows ?? [] : memoryRows;
    return source
      .filter((r) => !r._sync.deleted)
      .map((r) => ({ id: r.id, data: r.data, sync: r._sync }))
      .sort((a, b) =>
        (b.data.updatedAt ?? "").localeCompare(a.data.updatedAt ?? ""),
      );
  }, [apiRows, dexieRows, memoryRows, store]);

  const lastSyncedAt = useMemo<Date | null>(() => {
    let latest: Date | null = null;
    for (const r of rows) {
      if (!r.sync.syncedAt) continue;
      const d = new Date(r.sync.syncedAt);
      if (!latest || d > latest) latest = d;
    }
    return latest;
  }, [rows]);

  const create = useCallback(
    async (input: CreateCmsRecordRequest) => {
      if (!store) throw new Error("Offline store not ready");

      if (store instanceof NullLocalStore) {
        await cmsRecords.create(collectionKey, input);
        await refresh();
        return;
      }

      const id = ulid();
      const now = new Date().toISOString();
      const data: CmsRecordDto = {
        id,
        status: (input.status as ContentStatus) ?? "DRAFT",
        authorId: null,
        data: input.data,
        createdAt: now,
        updatedAt: now,
      };
      await store.upsertLocal(entity, { id, data }, "create");
      const payload: CmsCreatePayload = {
        ...input,
        id,
        collectionKey,
        clientId: id,
      };
      await store.enqueueJob(
        buildJob({
          entity,
          op: "create",
          refId: id,
          payload,
          baseUpdatedAt: null,
        }),
      );
      setBump((n) => n + 1);
      void engine?.trigger();
    },
    [store, engine, entity, collectionKey, refresh],
  );

  const update = useCallback(
    async (id: string, patch: UpdateCmsRecordRequest) => {
      if (!store) throw new Error("Offline store not ready");

      if (store instanceof NullLocalStore) {
        await cmsRecords.update(collectionKey, id, patch);
        await refresh();
        return;
      }

      const existing = await store.getById<CmsRecordDto>(entity, id);
      if (!existing) throw new Error("Row not found");
      const next: CmsRecordDto = {
        ...existing.data,
        ...(patch.status ? { status: patch.status } : {}),
        data: patch.data ?? existing.data.data,
        id,
        updatedAt: new Date().toISOString(),
      };
      await store.upsertLocal(entity, { id, data: next }, "update");
      // Fold the edit into a still-queued create instead of enqueuing a
      // separate update that would orphan (404 → conflict) once the create is
      // assigned a server id.
      const coalesced = await store.mergePendingCreatePayload(
        entity,
        id,
        patch as Record<string, unknown>,
      );
      if (!coalesced) {
        const payload: CmsUpdatePayload = { ...patch, collectionKey };
        await store.enqueueJob(
          buildJob({
            entity,
            op: "update",
            refId: id,
            payload,
            baseUpdatedAt: existing._sync.baseUpdatedAt ?? null,
          }),
        );
      }
      setBump((n) => n + 1);
      void engine?.trigger();
    },
    [store, engine, entity, collectionKey, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!store) throw new Error("Offline store not ready");

      if (store instanceof NullLocalStore) {
        await cmsRecords.remove(collectionKey, id);
        await refresh();
        return;
      }

      const existing = await store.getById<CmsRecordDto>(entity, id);
      if (!existing) return;
      // If the create is still queued, the row never reached the server — drop
      // the queued create and the local row; no delete request needed.
      const dropped = await store.dropPendingCreate(entity, id);
      if (dropped) {
        await store.deleteRow(entity, id);
      } else {
        await store.softDeleteLocal(entity, id);
        const payload: CmsDeletePayload = { collectionKey };
        await store.enqueueJob(
          buildJob({
            entity,
            op: "delete",
            refId: id,
            payload,
            baseUpdatedAt: existing._sync.baseUpdatedAt ?? null,
          }),
        );
      }
      setBump((n) => n + 1);
      void engine?.trigger();
    },
    [store, engine, entity, collectionKey, refresh],
  );

  const isLoading =
    !hasLoaded &&
    (store instanceof DexieLocalStore
      ? dexieRows == null
      : !store || store instanceof NullLocalStore);

  return {
    rows,
    isLoading,
    isFetching,
    lastSyncedAt,
    refresh,
    create,
    update,
    remove,
  };
}
