import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { isServerUnreachable } from '~/lib/api-client'
import {
  isTerminal,
  useInvalidateAfterInstall,
  useModuleInstallJob,
  type ModuleInstallJob,
  type ModuleInstallStep,
} from '~/hooks/api/use-module-install'

const STEPS: { key: ModuleInstallStep; label: string }[] = [
  { key: 'migrate', label: 'Applying migrations' },
  { key: 'build', label: 'Rebuilding the front-end' },
  { key: 'enable', label: 'Enabling the module' },
  { key: 'restart', label: 'Restarting the server' },
]

function stepIndex(step: ModuleInstallStep | null): number {
  return step ? STEPS.findIndex((s) => s.key === step) : -1
}

/**
 * Live progress for one install, including the part where the server goes away.
 *
 * The restart is the interesting case. Once the job reaches `awaiting_restart`
 * the process exits, every poll fails, and the naive reading of that is "the
 * install crashed" — which is what the operator would be shown at the exact
 * moment everything went right. `isServerUnreachable` separates "nothing
 * answered" from "the server answered with an error", and that one distinction
 * is what makes this readable.
 */
export function ModuleInstallProgress({
  jobId,
  onDismiss,
}: {
  jobId: string
  onDismiss: () => void
}) {
  const query = useModuleInstallJob(jobId)
  const invalidate = useInvalidateAfterInstall()

  /**
   * The last state we actually saw. Needed because during the restart there is
   * no fresh data at all, and what to show depends on where the job had got to.
   */
  const [lastSeen, setLastSeen] = useState<ModuleInstallJob | null>(null)
  const invalidated = useRef(false)

  const job = query.data?.job ?? null

  useEffect(() => {
    if (job) setLastSeen(job)
  }, [job])

  useEffect(() => {
    if (job?.state === 'succeeded' && !invalidated.current) {
      invalidated.current = true
      invalidate()
    }
  }, [job?.state, invalidate])

  const current = job ?? lastSeen
  if (!current) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Starting…
      </div>
    )
  }

  /**
   * Unreachable while the job was waiting on its restart is the *expected*
   * path, not a failure. Unreachable at any other point, or a real error
   * response, is not.
   */
  const restarting =
    query.isError &&
    isServerUnreachable(query.error) &&
    lastSeen?.state === 'awaiting_restart'

  const brokenConnection = query.isError && isServerUnreachable(query.error) && !restarting
  const realError = query.isError && !isServerUnreachable(query.error)

  const failed = current.state === 'failed' || current.state === 'abandoned'
  const done = current.state === 'succeeded'
  const active = stepIndex(current.step)

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {done ? (
            <Check className="size-4 text-emerald-600" aria-hidden />
          ) : failed ? (
            <AlertCircle className="size-4 text-destructive" aria-hidden />
          ) : restarting ? (
            <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          <span>
            {done
              ? `${current.module} is installed`
              : failed
                ? `Installing ${current.module} failed`
                : restarting
                  ? 'Restarting…'
                  : `Installing ${current.module}`}
          </span>
        </div>

        {isTerminal(current.state) ? (
          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-6 gap-1 px-2 text-xs">
            <X className="size-3" aria-hidden />
            Dismiss
          </Button>
        ) : null}
      </div>

      {restarting ? (
        <p className="text-xs text-muted-foreground">
          The server is coming back up. This page will update on its own — there is nothing to do.
        </p>
      ) : null}

      {brokenConnection ? (
        <p className="text-xs text-muted-foreground">
          Lost contact with the server. Still trying…
        </p>
      ) : null}

      {realError ? (
        <p className="text-xs text-destructive" role="alert">
          Could not read the install status.
        </p>
      ) : null}

      {!done && !failed ? (
        <ol className="space-y-1">
          {STEPS.filter((s) => s.key !== 'build' || current.requiresBuild)
            .filter((s) => s.key !== 'restart' || current.requiresRestart)
            .map((step) => {
              const index = STEPS.findIndex((s) => s.key === step.key)
              const state = index < active ? 'done' : index === active ? 'active' : 'pending'

              return (
                <li
                  key={step.key}
                  className={`flex items-center gap-2 text-xs ${
                    state === 'pending' ? 'text-muted-foreground/60' : 'text-muted-foreground'
                  }`}
                >
                  {state === 'done' ? (
                    <Check className="size-3 text-emerald-600" aria-hidden />
                  ) : state === 'active' ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <span className="size-3" aria-hidden />
                  )}
                  {step.label}
                </li>
              )
            })}
        </ol>
      ) : null}

      {failed && current.errorMessage ? (
        <p className="text-xs text-destructive" role="alert">
          {current.errorMessage}
        </p>
      ) : null}

      {failed && current.logTail ? (
        <pre className="max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {current.logTail}
        </pre>
      ) : null}

      {done && current.appliedMigrations.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Applied {current.appliedMigrations.length}{' '}
          {current.appliedMigrations.length === 1 ? 'migration' : 'migrations'}.
        </p>
      ) : null}
    </div>
  )
}
