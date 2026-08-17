import { Link } from '@inertiajs/react'
import { TriangleAlert } from 'lucide-react'
import { ApiError } from '~/lib/api'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/**
 * What a builder shows before its document has arrived.
 *
 * Both builders used to gate on `isLoading || !data`, which quietly folds the
 * *failed* case into the *pending* one: once the query settles as an error,
 * `isLoading` is false and `data` is still undefined, so the screen sits on
 * "Loading builder…" forever with nothing to click and nothing to read. A
 * deleted page, an id that changed, an expired session and a dropped connection
 * all presented as a hang.
 *
 * So this takes the error explicitly and refuses to render a spinner for it.
 */
export function BuilderLoadState({
  error,
  backHref,
  backLabel,
  missingLabel,
}: {
  /** The query's error, or null/undefined while it is still in flight. */
  error: unknown
  backHref: string
  backLabel: string
  /** What a 404 means here, in the caller's own words. */
  missingLabel: string
}) {
  if (!error) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading builder…
      </div>
    )
  }

  const status = error instanceof ApiError ? error.status : null
  const message =
    status === 404
      ? missingLabel
      : status === 401 || status === 403
        ? 'You do not have access to this. Try signing in again.'
        : ((error as Error)?.message ?? 'Something went wrong loading the builder.')

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <TriangleAlert className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">
        {status === 404 ? 'Not found' : "Couldn't open the builder"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Link href={backHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
        {backLabel}
      </Link>
    </div>
  )
}
