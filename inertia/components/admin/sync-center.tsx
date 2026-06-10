
import { CloudOff, RefreshCw, Loader2 } from "lucide-react";
import { useOffline } from "~/components/providers/offline-provider";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/**
 * Compact Sync Center trigger for the admin header. Today it only shows
 * pending/error counts and a "Sync now" button. The upcoming milestone
 * wires it into a side panel with per-job details.
 */
export function SyncCenter() {
  const { engine, mode, snapshot, syncNow } = useOffline();

  if (mode === "loading" || mode === "disabled" || !engine) return null;

  const pending = snapshot?.pending ?? 0;
  const conflicts = snapshot?.conflicts ?? 0;
  const errors = snapshot?.errors ?? 0;
  const running = snapshot?.running ?? false;
  const hasIssue = pending > 0 || conflicts > 0 || errors > 0;

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          hasIssue
            ? "text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            : "text-muted-foreground hover:bg-muted/60",
        )}
        onClick={() => syncNow()}
        aria-label="Sync now"
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
      </TooltipTrigger>
      <TooltipContent>
        {running
          ? "Flushing offline queue…"
          : hasIssue
            ? [
                pending > 0 ? `${pending} pending` : null,
                conflicts > 0 ? `${conflicts} conflict` : null,
                errors > 0 ? `${errors} error` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "All local changes are synced"}
      </TooltipContent>
    </Tooltip>
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
