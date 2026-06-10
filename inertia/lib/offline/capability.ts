/**
 * Storage capability detection.
 *
 * We treat "IndexedDB absent OR unable to open" the same — both fall back
 * to the in-memory store and surface a banner in the admin shell.
 */

export type StorageMode = "idb" | "memory" | "disabled";

const DISABLE_FLAG = "NEXT_PUBLIC_DISABLE_OFFLINE";

function hasIndexedDB(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { indexedDB?: unknown }).indexedDB !== "undefined"
  );
}

/**
 * Probes IndexedDB by opening a throwaway database. Resolves to `false`
 * when the environment blocks IDB (Firefox private mode, corporate policy,
 * quota exhaustion, etc.) even though the global exists.
 */
export async function probeIndexedDB(): Promise<boolean> {
  if (!hasIndexedDB()) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const name = "__driftless_idb_probe__";
      const req = indexedDB.open(name, 1);
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      req.onsuccess = () => {
        try {
          req.result.close();
          indexedDB.deleteDatabase(name);
        } catch {
          /* ignore cleanup failures */
        }
        done(true);
      };
      req.onerror = () => done(false);
      req.onblocked = () => done(false);
      setTimeout(() => done(false), 1500);
    });
  } catch {
    return false;
  }
}

export async function detectStorageMode(): Promise<StorageMode> {
  if (
    typeof process !== "undefined" &&
    process.env?.[DISABLE_FLAG] === "1"
  ) {
    return "disabled";
  }
  if (typeof window === "undefined") {
    return "memory";
  }
  const idb = await probeIndexedDB();
  return idb ? "idb" : "memory";
}
