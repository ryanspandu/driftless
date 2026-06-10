import { Link } from '@inertiajs/react'
import { AlertTriangle } from 'lucide-react'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export default function ServerError() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-destructive/5 text-destructive">
        <AlertTriangle className="size-8" strokeWidth={1.5} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Error</p>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          An unexpected error occurred. Please try again in a moment.
        </p>
      </div>

      <Link href="/" className={cn(buttonVariants())}>
        Go home
      </Link>
    </div>
  )
}
