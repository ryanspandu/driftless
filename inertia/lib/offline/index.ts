export type { LocalStore } from "./local-store";
export type {
  EntityName,
  LocalRow,
  OutboxJob,
  OutboxStatus,
  SyncMeta,
  SyncOp,
} from "./schema";
export { cmsEntity, freshSyncMeta, isCmsEntity } from "./schema";
export type { StorageMode } from "./capability";
export { detectStorageMode, probeIndexedDB } from "./capability";
export { DexieLocalStore } from "./dexie-store";
export { MemoryLocalStore } from "./memory-store";
export { NullLocalStore } from "./null-store";
export { toSyncStatus, syncStatusOf } from "./sync-status";
export type { EntitySyncHandler, EngineSnapshot } from "./sync-engine";
export { SyncEngine, buildJob } from "./sync-engine";
