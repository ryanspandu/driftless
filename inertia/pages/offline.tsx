import { Link } from '@inertiajs/react'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">You are offline</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page was shown because your browser could not reach the server. Cached public pages may
        still be available.
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        Try again
      </Link>
    </div>
  )
}
