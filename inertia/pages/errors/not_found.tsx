import { Link } from '@inertiajs/react'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Button, buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

interface NotFoundProps {
  path?: string
}

export default function NotFound({ path }: NotFoundProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-muted/40 text-muted-foreground">
        <FileQuestion className="size-8" strokeWidth={1.5} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          The page you are looking for does not exist or may have been moved.
          {path ? (
            <>
              {' '}
              <span className="font-mono text-foreground/80">{path}</span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (window.history.length > 1) window.history.back()
            else window.location.assign('/')
          }}
        >
          <ArrowLeft className="size-4" />
          Go back
        </Button>
        <Link href="/" className={cn(buttonVariants())}>
          Go home
        </Link>
      </div>
    </div>
  )
}
