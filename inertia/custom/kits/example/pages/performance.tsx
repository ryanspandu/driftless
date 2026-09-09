import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'
// Import assets so Vite fingerprints + serves them from your own origin (the app
// then compresses + long-caches them). Never hardcode a raw /assets path.
import demoHero from '../assets/demo-hero.svg'

/**
 * Performance reference — the patterns that keep a kit page fast (Lighthouse).
 *
 * The APP already does the heavy lifting for you: it brotli/gzips + immutably
 * caches assets, links your kit CSS in the <head> (no flash), hydrates the SSR
 * HTML instead of re-rendering it, and keeps the editor out of the public
 * bundle. So a kit only has to get the CONTENT-level rules right — the ones
 * below. See the "Performance" section of inertia/custom/kits/README.md.
 */
export const path = 'kit-example/performance'
export const title = 'Performance (example file-page)'

export default function Performance({ header, footer }: CodePageProps) {
  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Performance"
      title="Fast by default"
      intro="Everything above the fold is visible on the first paint — no opacity:0-until-JS. The hero below is the LCP element and is fetched at high priority."
    >
      {/* ── LCP image ──────────────────────────────────────────────────────
          The largest above-the-fold image is what Lighthouse measures as LCP.
          - fetchPriority="high" + loading="eager": fetch it right away.
          - decoding="async": don't block the main thread decoding it.
          - width/height: reserve space so it never causes layout shift (CLS).
          - Right-size + prefer WebP/AVIF for real photos (a 1200px JPEG shrunk
            into a phone is wasted bytes — Lighthouse flags "Improve image
            delivery"). SVG (like this demo) is already tiny + resolution-free. */}
      <img
        src={demoHero}
        alt="A demo hero"
        width={1200}
        height={750}
        fetchPriority="high"
        loading="eager"
        decoding="async"
        className="w-full rounded-2xl"
      />

      <div className="mt-12 space-y-6">
        <h2 className="text-lg font-semibold text-foreground">Below the fold</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Images further down should be <strong className="font-medium">lazy</strong> so they never
          compete with the first paint:
        </p>
        {/* ── Below-the-fold image ─────────────────────────────────────────
            loading="lazy" defers the fetch until it scrolls near the viewport,
            decoding="async" keeps decoding off the main thread. Always keep the
            width/height to hold its space. */}
        <img
          src={demoHero}
          alt="A second demo image, lazy-loaded"
          width={1200}
          height={750}
          loading="lazy"
          decoding="async"
          className="w-full rounded-2xl opacity-90"
        />
      </div>

      <div className="mt-12 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">The three content rules</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>
            Above-the-fold content is <strong className="font-medium">visible on first paint</strong>{' '}
            — never hide it behind a JS scroll-reveal (that delays LCP on a slow phone). Animate
            below-the-fold only, or use a CSS entrance that plays on load.
          </li>
          <li>
            The LCP image is <strong className="font-medium">eager + high priority</strong>; every
            other image is <strong className="font-medium">lazy</strong>. Right-size photos and use
            WebP/AVIF.
          </li>
          <li>
            Load web fonts <strong className="font-medium">without blocking render</strong> (see the
            README) — or lean on the app's appearance font / a system stack.
          </li>
        </ol>
      </div>
    </PageShell>
  )
}
