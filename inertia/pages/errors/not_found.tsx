import { Head, Link } from '@inertiajs/react'
import { ArrowLeft, ArrowUpRight, Compass, Home, Search } from 'lucide-react'
import { Button, buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export interface NotFoundLink {
  href: string
  label: string
  description?: string
}

interface NotFoundProps {
  path?: string
  /**
   * Extra places to send the visitor.
   *
   * Empty by default, and the section is hidden when it is — deliberately.
   * Core has no always-correct source for these: the site's own navigation
   * lives in a builder header template, and `/shop` only resolves once the
   * e-commerce module is enabled *and* configured. A 404 whose helpful links
   * lead to another 404 is worse than one with none.
   *
   * Pass them from a route that actually knows. Deriving them here would mean a
   * database query on an error path, which is the one place a flood of requests
   * is most likely to arrive.
   */
  links?: NotFoundLink[]
}

export default function NotFound({ path, links = [] }: NotFoundProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-20 text-foreground">
      <Head title="Page not found" />

      {/*
        Decoration, drawn in CSS rather than shipped as an asset: an error page
        is the last place that should depend on another request succeeding, and
        a strict CSP blocks remote images on some deployments.

        `aria-hidden` throughout — none of it carries meaning, and a screen
        reader announcing a decorative "404" ahead of the real heading is noise.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Grid, masked to fade out before it reaches the edges. */}
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

        {/* One soft wash of the brand colour, kept well under text contrast. */}
        <div className="absolute top-1/2 left-1/2 size-[36rem] -translate-x-1/2 -translate-y-[60%] rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl text-center">
        {/*
          The oversized numeral sits *behind* the heading rather than above it,
          so the page reads as one composition instead of a stack of blocks.
        */}
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-20 bg-gradient-to-b from-foreground/[0.07] to-transparent bg-clip-text text-[10rem] leading-none font-bold tracking-tighter text-transparent select-none sm:text-[13rem]"
          >
            404
          </span>

          <div className="relative pt-6">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Error 404
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              This page has wandered off
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
              The link may be out of date, or the page may have moved somewhere else.
            </p>
          </div>
        </div>

        {path ? (
          <div className="mt-6 flex justify-center">
            <code className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 px-3.5 py-1.5 font-mono text-xs text-muted-foreground">
              <Search className="size-3.5 shrink-0" aria-hidden />
              {/*
                Rendered as text, never as markup. This is the raw URL a visitor
                typed, so it is attacker-controlled — exactly the kind of value
                that becomes reflected XSS the moment someone reaches for
                `dangerouslySetInnerHTML` to make it look nicer.
              */}
              <span className="truncate">{path}</span>
            </code>
          </div>
        ) : null}

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {/*
            Sized explicitly. The design system's `lg` is `h-9`, barely larger
            than the default — fine in a toolbar, undersized beneath a 48px
            headline.
          */}
          <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'h-11 gap-2 px-5')}>
            <Home className="size-4" aria-hidden />
            Go home
          </Link>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-11 gap-2 px-5"
            onClick={() => {
              /**
               * Only when there is somewhere to go back to. On a directly
               * opened link the history is empty and the button would do
               * nothing at all, which reads as broken.
               */
              if (window.history.length > 1) window.history.back()
              else window.location.assign('/')
            }}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Go back
          </Button>
        </div>

        {links.length > 0 ? (
          <div className="mt-14 border-t border-border pt-8">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Or try one of these
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card/50 px-4 py-3 text-left transition-colors hover:border-foreground/20 hover:bg-accent/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                    <Compass className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{link.label}</span>
                    {link.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {link.description}
                      </span>
                    ) : null}
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-12 border-t border-border pt-8 text-xs text-muted-foreground">
            If you typed the address, it is worth checking it for a typo.
          </p>
        )}
      </div>
    </div>
  )
}
