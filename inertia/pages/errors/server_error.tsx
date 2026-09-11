import { Head, Link } from '@inertiajs/react'
import { Home, RefreshCw } from 'lucide-react'
import { Button, buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/**
 * The 500 page.
 *
 * Shares the 404's composition on purpose — a visitor who hits both should feel
 * they are still on the same site — but says nothing about *what* failed. The
 * one thing an error page must never do is leak internals: no stack, no message,
 * no request id that maps to something a stranger can look up.
 */
export default function ServerError() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-20 text-foreground">
      <Head title="Something went wrong" />

      {/* Decoration only. Drawn in CSS so this page needs no second request. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-border) 1px, transparent 1px),' +
              'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 60% at 50% 45%, black 30%, transparent 100%)',
          }}
        />
        {/* Destructive rather than brand: the page should feel different at a glance. */}
        <div className="absolute top-1/2 left-1/2 size-[36rem] -translate-x-1/2 -translate-y-[60%] rounded-full bg-destructive/[0.06] blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl text-center">
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-20 bg-gradient-to-b from-foreground/[0.07] to-transparent bg-clip-text text-[10rem] leading-none font-bold tracking-tighter text-transparent select-none sm:text-[13rem]"
          >
            500
          </span>

          <div className="relative pt-6">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Server error
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Something went wrong
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
              This one is on us, not you. The problem has been logged — trying again in a moment
              often works.
            </p>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            className="h-11 gap-2 px-5"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 gap-2 px-5')}
          >
            <Home className="size-4" aria-hidden />
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
