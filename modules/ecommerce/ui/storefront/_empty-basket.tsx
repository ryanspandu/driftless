/**
 * The empty-basket state — a soft grid backdrop, an outlined basket, and the
 * two ways forward.
 *
 * Shared by `/shop/cart` and `/shop/checkout` so their "nothing here" screen is
 * identical. No `<Head>` here: the page owns the document title.
 */
export function EmptyBasket() {
  return (
    // `flex-1` + centering so it fills the space between the site header and
    // footer and sits vertically centred (it is the middle item of the
    // storefront layout's `min-h-screen` column). Outside that flex column — e.g.
    // rendered as a block on a builder page — `flex-1` is simply inert.
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16">
      {/*
        The same treatment as the error pages, drawn in CSS rather than shipped
        as an asset. `aria-hidden` because none of it means anything — a screen
        reader should hear the heading, not the scenery.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-border) 1px, transparent 1px),' +
              'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 65% 60% at 50% 40%, black 25%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 65% 60% at 50% 40%, black 25%, transparent 100%)',
          }}
        />
        <div className="absolute top-1/2 left-1/2 size-[30rem] -translate-x-1/2 -translate-y-[65%] rounded-full bg-primary/[0.06] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-lg text-center">
        {/*
          An outlined basket rather than a filled one: the illustration should
          read as "nothing in it", and a solid icon says the opposite.
        */}
        <div className="mx-auto flex size-20 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-9 text-muted-foreground"
            aria-hidden
          >
            <path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
            <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
          </svg>
        </div>

        <h1 className="mt-7 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Your basket is empty
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-pretty text-muted-foreground">
          Nothing in it yet. Anything you add is kept here while you look around.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/shop"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
              aria-hidden
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
            Browse the shop
          </a>
          <a
            href="/"
            className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-accent/40"
          >
            Back home
          </a>
        </div>

        {/*
          Only shown to someone who might actually have an order to find.
          Telling a first-time visitor about "your previous orders" is noise.
        */}
        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
          Bought something already? The link in your confirmation email opens that order — no
          account needed.
        </p>
      </div>
    </div>
  )
}
