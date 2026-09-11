
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useOffline } from "~/components/providers/offline-provider";
import { DexieLocalStore } from "~/lib/offline/dexie-store";
import type { EntityName, SyncMeta } from "~/lib/offline/schema";

const EMPTY_SYNC_MAP = new Map<string, SyncMeta>();

/**
 * Returns an `id → SyncMeta` map for the given entity. The UI overlays
 * this on top of paginated server rows so that the Sync column still
 * reflects pending outbox jobs for rows that are currently visible.
 *
 * Uses `useLiveQuery` when Dexie is active, falls back to a snapshot
 * (refreshed via the `bump` effect) for the memory store.
 */
export function useSyncMetaMap(entity: EntityName): Map<string, SyncMeta> {
  const { store, snapshot } = useOffline();
  const useDexie = store instanceof DexieLocalStore;

  const dexieMap = useLiveQuery(async () => {
    if (!useDexie || !store) return null;
    const rows = await store.getAll(entity);
    const map = new Map<string, SyncMeta>();
    for (const r of rows) map.set(r.id, r._sync);
    return map;
  }, [useDexie, store, entity]);

  const [memMap, setMemMap] = useState<Map<string, SyncMeta>>(new Map());
  useEffect(() => {
    if (!store || useDexie) return;
    let cancelled = false;
    void store.getAll(entity).then((rows) => {
      if (cancelled) return;
      const m = new Map<string, SyncMeta>();
      for (const r of rows) m.set(r.id, r._sync);
      setMemMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [store, useDexie, entity, snapshot?.pending, snapshot?.lastRunAt]);

  return useDexie ? (dexieMap ?? EMPTY_SYNC_MAP) : memMap;
}
