
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CloudOff,
  GitMerge,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useOffline } from "~/components/providers/offline-provider";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { isCmsEntity, type OutboxJob } from "~/lib/offline";
import { cn } from "~/lib/utils";

/** Turn an internal entity id into a human label for the issue list. */
function entityLabel(entity: string): string {
  if (entity === "users") return "Users";
  if (entity === "content") return "Content";
  if (isCmsEntity(entity)) return entity.slice("cms:".length) || "Collection";
  return entity;
}

const OP_LABEL: Record<OutboxJob["op"], string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
};

/** One failed / conflicted / retrying job, with what went wrong and where. */
function SyncIssueRow({
  job,
  onDiscard,
}: {
  job: OutboxJob;
  onDiscard: (job: OutboxJob) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const isConflict = job.status === "conflict";
  const isError = job.status === "error";
  const Icon = isConflict ? GitMerge : isError ? AlertTriangle : RefreshCw;
  const tone = isConflict
    ? "text-amber-600 dark:text-amber-400"
    : isError
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  return (
    <li className="flex gap-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <span>{OP_LABEL[job.op]}</span>
          <span className="text-muted-foreground">·</span>
          <span className="truncate">{entityLabel(job.entity)}</span>
          <span
            className={cn(
              "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              isConflict
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                : isError
                  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {isConflict ? "Conflict" : isError ? "Failed" : "Retrying"}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={discarding}
            aria-label="Discard this change"
            title="Discard this change"
            className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
        <p className="break-words text-xs text-muted-foreground">
          {job.lastError ?? "Unknown error"}
        </p>
        <p className="truncate text-[10px] text-muted-foreground/70">
          ref: {job.refId}
          {job.attempts > 0 ? ` · ${job.attempts} attempt${job.attempts > 1 ? "s" : ""}` : ""}
        </p>

        {confirming && (
          <div className="mt-1.5 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 dark:border-red-900/50 dark:bg-red-950/30">
            <span className="flex-1 text-[11px] text-red-700 dark:text-red-300">
              Discard this change? It won't be sent to the server.
            </span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={discarding}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                setDiscarding(true);
                try {
                  await onDiscard(job);
                } finally {
                  setDiscarding(false);
                  setConfirming(false);
                }
              }}
              disabled={discarding}
              className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {discarding && <Loader2 className="size-3 animate-spin" aria-hidden />}
              Discard
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Compact Sync Center trigger for the admin header. Clicking it opens a
 * popover listing every offline job that failed, conflicted, or is waiting
 * to retry — so you can see *what* went wrong and *where* — plus a manual
 * "Sync now" button to retry the queue.
 */
export function SyncCenter() {
  const { store, engine, mode, snapshot, syncNow } = useOffline();
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<OutboxJob[]>([]);

  const loadIssues = useCallback(() => {
    if (!store) return;
    void store.listAllJobs().then((all) => {
      setIssues(
        all.filter(
          (job) =>
            job.status === "error" ||
            job.status === "conflict" ||
            (job.status === "idle" && job.lastError != null),
        ),
      );
    });
  }, [store]);

  // Refresh the list whenever the popover is open and the queue state moves.
  useEffect(() => {
    if (open) loadIssues();
  }, [open, loadIssues, snapshot]);

  // Drop a stuck job from the outbox and clear its error meta on the row, then
  // nudge the engine so the header badge recomputes its counts.
  const discardJob = useCallback(
    async (job: OutboxJob) => {
      if (!store) return;
      await store.deleteJob(job.id);
      await store
        .setRowMeta(job.entity, job.refId, { lastError: null, conflict: false })
        .catch(() => {});
      await engine?.trigger();
      loadIssues();
    },
    [store, engine, loadIssues],
  );

  if (mode === "loading" || mode === "disabled" || !engine) return null;

  const pending = snapshot?.pending ?? 0;
  const conflicts = snapshot?.conflicts ?? 0;
  const errors = snapshot?.errors ?? 0;
  const running = snapshot?.running ?? false;
  const hasIssue = pending > 0 || conflicts > 0 || errors > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          hasIssue
            ? "text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            : "text-muted-foreground hover:bg-muted/60",
        )}
        aria-label="Open sync center"
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : hasIssue ? (
          <CloudOff className="size-3.5" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        <span className="hidden md:inline">
          {running
            ? "Syncing…"
            : conflicts > 0
              ? `${conflicts} conflict${conflicts > 1 ? "s" : ""}`
              : pending > 0
                ? `${pending} pending`
                : errors > 0
                  ? `${errors} error${errors > 1 ? "s" : ""}`
                  : "Synced"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Sync center</p>
            <p className="text-xs text-muted-foreground">
              {running
                ? "Flushing offline queue…"
                : hasIssue
                  ? [
                      pending > 0 ? `${pending} pending` : null,
                      conflicts > 0 ? `${conflicts} conflict${conflicts > 1 ? "s" : ""}` : null,
                      errors > 0 ? `${errors} error${errors > 1 ? "s" : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "All local changes are synced"}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => {
              syncNow();
              loadIssues();
            }}
            disabled={running}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            Sync now
          </Button>
        </div>

        {issues.length > 0 ? (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto p-2">
            {issues.map((job) => (
              <SyncIssueRow key={job.id} job={job} onDiscard={discardJob} />
            ))}
          </ul>
        ) : (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {hasIssue
              ? "Changes are queued and will sync automatically."
              : "No sync issues. Everything is up to date."}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Banner shown once at the top of the admin shell when the storage
 * capability falls back to memory. Drafts won't survive a reload.
 */
export function OfflineCapabilityBanner() {
  const { mode } = useOffline();
  if (mode !== "memory") return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <CloudOff className="size-3.5" aria-hidden />
      <span>
        Offline drafts are not available in this browser. Changes stay only
        for this session.
      </span>
    </div>
  );
}

/**
 * Small helper that turns a Sync button into a Button component (used by
 * forms). Currently reuses `syncNow`; later we'll wire per-row retry.
 */
export function SyncNowButton({ className }: { className?: string }) {
  const { syncNow, snapshot, mode } = useOffline();
  if (mode === "disabled") return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-2", className)}
      onClick={() => syncNow()}
      disabled={!!snapshot?.running}
    >
      {snapshot?.running ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-4" aria-hidden />
      )}
      Sync now
    </Button>
  );
}
