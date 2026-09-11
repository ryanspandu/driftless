/**
 * Outbox jobs reference rows by `refId`. After an offline **create**, the server
 * returns a canonical `data.id` that may differ (e.g. client ULID vs server ULID).
 * IndexedDB rows must be keyed by `data.id` so `putServerRows` and `getById`
 * stay consistent — otherwise we get two rows for one entity.
 */
export function storageKeyForSyncedRow<TData>(refId: string, data: TData): string {
  if (data && typeof data === "object" && "id" in data) {
    const sid = (data as { id: unknown }).id;
    if (typeof sid === "string" && sid.length > 0) {
      return sid;
    }
  }
  return refId;
}
