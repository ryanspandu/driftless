
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ulid } from "ulid";
import type {
  ContentDto,
  ContentStatus,
  CreateContentRequest,
  UpdateContentRequest,
} from "~/types/api";
import { useOffline } from "~/components/providers/offline-provider";
import { apiFetch } from "~/lib/api-client";
import {
  buildJob,
  type LocalRow,
  type SyncMeta,
  DexieLocalStore,
  NullLocalStore,
} from "~/lib/offline";
import type {
  ContentCreatePayload,
  ContentUpdatePayload,
} from "~/lib/offline/handlers/content-handler";

export interface OfflineContentRow {
  id: string;
  data: ContentDto;
  sync: SyncMeta;
}

export interface UseOfflineContentResult {
  rows: OfflineContentRow[];
  isLoading: boolean;
  isFetching: boolean;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
  create: (input: CreateContentRequest) => Promise<void>;
  update: (id: string, patch: UpdateContentRequest) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Offline-first hook for the `/admin/content` table. Source of truth is
 * Dexie — mutations optimistically write locally and enqueue an outbox
 * job; the sync engine flushes to the REST API in the background.
 *
 * When the store is a `MemoryLocalStore` (IndexedDB disabled), the same
 * API works for the session but rows are lost on reload. When it's
 * `NullLocalStore` (offline feature flag off), we degrade to plain REST.
 */
export function useOfflineContent(): UseOfflineContentResult {
  const { store, engine } = useOffline();
  
  const [isFetching, setIsFetching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [apiRows, setApiRows] = useState<ContentDto[]>([]);
  const [bump, setBump] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    setIsFetching(true);
    try {
      const rows = await apiFetch<ContentDto[]>('/api/admin/content')
      if (!mountedRef.current) return;
      setApiRows(rows);
      if (store && !(store instanceof NullLocalStore)) {
        await store.putServerRows(
          "content",
          rows.map((r) => ({ id: r.id, data: r, serverUpdatedAt: r.updatedAt })),
        );
      }
      setBump((n) => n + 1);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[offline-content] refresh failed", err);
      }
    } finally {
      refreshInFlightRef.current = false
      if (mountedRef.current) {
        setIsFetching(false);
        setHasLoaded(true);
      }
    }
  }, [store])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const dexieRows = useLiveQuery(async () => {
    if (!store || !(store instanceof DexieLocalStore)) return null;
    return store.getAll<ContentDto>("content");
  }, [store, bump]);

  const [memoryRows, setMemoryRows] = useState<LocalRow<ContentDto>[]>([]);
  useEffect(() => {
    if (!store || store instanceof DexieLocalStore) return;
    let cancelled = false;
    void store.getAll<ContentDto>("content").then((rows) => {
      if (!cancelled) setMemoryRows(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [store, bump]);

  const rows = useMemo<OfflineContentRow[]>(() => {
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
      store instanceof DexieLocalStore
        ? dexieRows ?? []
        : memoryRows;
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
    async (input: CreateContentRequest) => {
      if (!store) throw new Error("Offline store not ready");

      if (store instanceof NullLocalStore) {
        await apiFetch<ContentDto>("/api/admin/content", {
          method: "POST",
          body: JSON.stringify(input),
        });
        await refresh();
        return;
      }

      const id = ulid();
      const now = new Date().toISOString();
      const data: ContentDto = {
        id,
        title: input.title,
        slug: input.slug,
        body: input.body,
        status: input.status as ContentStatus,
        authorId: null,
        createdAt: now,
        updatedAt: now,
      };
      await store.upsertLocal("content", { id, data }, "create");
      const payload: ContentCreatePayload = { id, ...input };
      await store.enqueueJob(
        buildJob({
          entity: "content",
          op: "create",
          refId: id,
          payload,
          baseUpdatedAt: null,
        }),
      );
      setBump((n) => n + 1);
      void engine?.trigger();
    },
    [store, engine, refresh],
  );

  const update = useCallback(
    async (id: string, patch: UpdateContentRequest) => {
      if (!store) throw new Error("Offline store not ready");

      if (store instanceof NullLocalStore) {
        await apiFetch<ContentDto>(`/api/admin/content/${id}`, {
          method: "PUT",
          body: JSON.stringify(patch),
        });
        await refresh();
        return;
      }

      const existing = await store.getById<ContentDto>("content", id);
      if (!existing) throw new Error("Row not found");
      const next: ContentDto = {
        ...existing.data,
        ...(patch as Partial<ContentDto>),
        id,
        updatedAt: new Date().toISOString(),
      };
      await store.upsertLocal("content", { id, data: next }, "update");
      const payload: ContentUpdatePayload = patch;
      await store.enqueueJob(
        buildJob({
          entity: "content",
          op: "update",
          refId: id,
          payload,
          baseUpdatedAt: existing._sync.baseUpdatedAt ?? null,
        }),
      );
      setBump((n) => n + 1);
      void engine?.trigger();
    },
    [store, engine, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!store) throw new Error("Offline store not ready");

      if (store instanceof NullLocalStore) {
        await apiFetch<void>(`/api/admin/content/${id}`, { method: "DELETE" });
        await refresh();
        return;
      }

      const existing = await store.getById<ContentDto>("content", id);
      if (!existing) return;
      await store.softDeleteLocal("content", id);
      await store.enqueueJob(
        buildJob({
          entity: "content",
          op: "delete",
          refId: id,
          payload: null,
          baseUpdatedAt: existing._sync.baseUpdatedAt ?? null,
        }),
      );
      setBump((n) => n + 1);
      void engine?.trigger();
    },
    [store, engine, refresh],
  );

  const isLoading =
    !hasLoaded &&
    (store instanceof DexieLocalStore ? dexieRows == null : !store || store instanceof NullLocalStore);

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
