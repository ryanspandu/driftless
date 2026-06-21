
import type { LocalStore } from "./local-store";
import { isCmsEntity, type EntityName, type OutboxJob, type SyncOp } from "./schema";

/**
 * Per-entity adapter that knows how to translate an outbox job into an
 * HTTP call and how to shape the response back into a server row.
 *
 * Registered by entity-specific hooks (e.g. `use-offline-content.ts`)
 * so the engine stays free of API-specific knowledge.
 */
/**
 * A handler may register against a concrete entity name (`users`) or the
 * wildcard `cms:*`, which matches every dynamic CMS collection.
 */
export type HandlerEntity = EntityName | "cms:*";

export interface EntitySyncHandler<TServerRow = unknown, TPayload = unknown> {
  entity: HandlerEntity;
  apply(
    job: OutboxJob<TPayload>,
  ): Promise<{ row: TServerRow; updatedAt: string } | null>;
  /** Parse the error shape to decide the outcome class. */
  classify?(error: unknown): "network" | "conflict" | "fatal";
}

type EngineListener = (snapshot: EngineSnapshot) => void;

export interface EngineSnapshot {
  running: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  pending: number;
  conflicts: number;
  errors: number;
}

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

/**
 * Main-thread sync engine. The current plan keeps Service Worker
 * Background Sync out of scope — this runs while the tab is visible,
 * on `online`, after mutations, and on a manual "Sync now" trigger.
 */
export class SyncEngine {
  private readonly handlers = new Map<HandlerEntity, EntitySyncHandler>();
  private readonly listeners = new Set<EngineListener>();
  private running = false;
  private runQueued = false;
  private retryErrorsQueued = false;
  private snapshot: EngineSnapshot = {
    running: false,
    lastRunAt: null,
    lastError: null,
    pending: 0,
    conflicts: 0,
    errors: 0,
  };
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onOnline = () => void this.trigger();
  private onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      void this.trigger();
    }
  };

  constructor(private readonly store: LocalStore) {}

  registerHandler(handler: EntitySyncHandler): void {
    this.handlers.set(handler.entity, handler);
  }

  start(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void this.trigger();
      }
    }, 60_000);
    void this.refreshSnapshot();
  }

  stop(): void {
    if (typeof window === "undefined") return;
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): EngineSnapshot {
    return this.snapshot;
  }

  /**
   * Non-blocking nudge — safe to call after every mutation.
   *
   * `retryErrors` requeues jobs that previously failed (status `error`) for a
   * fresh attempt. Pass it only for an explicit user action ("Sync now") so
   * automatic triggers don't re-run genuinely fatal jobs every cycle.
   */
  async trigger(options: { retryErrors?: boolean } = {}): Promise<void> {
    if (this.store.mode === "disabled") return;
    if (options.retryErrors) this.retryErrorsQueued = true;
    if (this.running) {
      this.runQueued = true;
      return;
    }
    this.running = true;
    this.emit({ ...this.snapshot, running: true });
    try {
      if (this.retryErrorsQueued) {
        this.retryErrorsQueued = false;
        await this.requeueErroredJobs();
      }
      await this.drain();
    } finally {
      this.running = false;
      this.snapshot = {
        ...this.snapshot,
        running: false,
        lastRunAt: new Date().toISOString(),
      };
      await this.refreshSnapshot();
      if (this.runQueued) {
        this.runQueued = false;
        void this.trigger();
      }
    }
  }

  /** Reset failed jobs to idle so the next drain gives them a fresh attempt. */
  private async requeueErroredJobs(): Promise<void> {
    const jobs = await this.store.listAllJobs();
    const now = new Date().toISOString();
    for (const job of jobs) {
      if (job.status !== "error") continue;
      await this.store.updateJob(job.id, {
        status: "idle",
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
      });
    }
  }

  private async drain(): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const jobs = await this.store.listDueJobs();
    for (const job of jobs) {
      const handler = this.resolveHandler(job.entity);
      if (!handler) continue;
      await this.store.updateJob(job.id, { status: "running" });
      try {
        const result = await handler.apply(job);
        if (job.op === "delete") {
          await this.store.deleteRow(job.entity, job.refId);
        } else if (result) {
          await this.store.markSynced(
            job.entity,
            job.refId,
            result.row,
            result.updatedAt,
          );
        }
        await this.store.deleteJob(job.id);
      } catch (err) {
        // The server resource is gone (404) — happens when the DB row was
        // removed elsewhere but the offline copy lingered. The right outcome
        // depends on the op:
        //   • delete → that's the goal: drop the local row + job, no error.
        //   • update → the target no longer exists, so the local edit can't be
        //     applied: surface a conflict (keep the local data) rather than a
        //     hard error, so the user can recreate or discard it.
        //   • create → a missing collection endpoint is a genuine failure, so
        //     fall through to normal error handling.
        if (isGoneError(err) && job.op === "delete") {
          await this.store.deleteRow(job.entity, job.refId);
          await this.store.deleteJob(job.id);
        } else if (isGoneError(err) && job.op === "update") {
          await this.markGoneConflict(job);
        } else {
          await this.handleError(job, err, handler);
        }
      }
    }
  }

  private resolveHandler(entity: string): EntitySyncHandler | undefined {
    const direct = this.handlers.get(entity as HandlerEntity);
    if (direct) return direct;
    if (isCmsEntity(entity)) return this.handlers.get("cms:*");
    return undefined;
  }

  /**
   * The row an update targeted was deleted on the server. Park the job as a
   * conflict and flag the local row so the Sync Center surfaces it; the local
   * data is kept so the user can recreate or discard the change.
   */
  private async markGoneConflict(job: OutboxJob): Promise<void> {
    const message =
      "The record was deleted on the server, so your offline changes could not be saved.";
    await this.store.updateJob(job.id, { status: "conflict", lastError: message });
    await this.store.setRowMeta(job.entity, job.refId, {
      conflict: true,
      lastError: message,
      pendingSince: null,
    });
  }

  private async handleError(
    job: OutboxJob,
    err: unknown,
    handler: EntitySyncHandler,
  ): Promise<void> {
    const classify = handler.classify ?? defaultClassify;
    const kind = classify(err);
    const message = (err as Error)?.message ?? String(err);

    if (kind === "conflict") {
      await this.store.updateJob(job.id, {
        status: "conflict",
        lastError: message,
      });
      await this.store.setRowMeta(job.entity, job.refId, {
        conflict: true,
        lastError: message,
        pendingSince: null,
      });
      return;
    }

    const attempts = job.attempts + 1;
    if (kind === "fatal" || attempts >= MAX_ATTEMPTS) {
      await this.store.updateJob(job.id, {
        status: "error",
        attempts,
        lastError: message,
      });
      await this.store.setRowMeta(job.entity, job.refId, {
        lastError: message,
        pendingSince: null,
      });
      return;
    }

    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
    await this.store.updateJob(job.id, {
      status: "idle",
      attempts,
      nextAttemptAt: new Date(Date.now() + backoff).toISOString(),
      lastError: message,
    });
  }

  private async refreshSnapshot(): Promise<void> {
    const counts = await this.store.countJobsByStatus();
    this.snapshot = {
      ...this.snapshot,
      pending: counts.idle + counts.running,
      conflicts: counts.conflict,
      errors: counts.error,
    };
    this.emit(this.snapshot);
  }

  private emit(next: EngineSnapshot): void {
    this.snapshot = next;
    for (const l of this.listeners) l(next);
  }
}

/** True when the server says the resource is already gone (404 / not found). */
function isGoneError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  if (status === 404) return true;
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return msg.includes("404") || msg.includes("not found");
}

function defaultClassify(err: unknown): "network" | "conflict" | "fatal" {
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  if (msg.includes("conflict") || msg.includes("409")) return "conflict";
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout")
  ) {
    return "network";
  }
  if (/\b5\d{2}\b/.test(msg)) return "network";
  return "fatal";
}

/**
 * Helper used by mutation hooks to build a consistent outbox job.
 */
export function buildJob<TPayload>(input: {
  entity: EntityName;
  op: SyncOp;
  refId: string;
  payload: TPayload;
  baseUpdatedAt: string | null;
}): Omit<OutboxJob<TPayload>, "id"> {
  const now = new Date().toISOString();
  return {
    entity: input.entity,
    op: input.op,
    refId: input.refId,
    payload: input.payload,
    baseUpdatedAt: input.baseUpdatedAt,
    attempts: 0,
    status: "idle",
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
  };
}
