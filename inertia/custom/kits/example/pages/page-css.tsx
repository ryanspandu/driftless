import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'
// ↓ This page owns its CSS. Just import it — Vite bundles it and the public
//   renderer links it in the <head>, so it loads render-critical (no FOUC).
import './page-css.css'

/**
 * Reference for **per-page CSS**: a single file-page with its own stylesheet.
 *
 * Copy this pair (`page-css.tsx` + `page-css.css`) to give any page hand-written
 * CSS that Tailwind can't express, without touching the kit-wide `styles.css`.
 * The classes below (`pgcss-*`) live only in `page-css.css`.
 */
export const path = 'kit-example/page-css'
export const title = 'Page-owned CSS (example file-page)'

export default function PageCss({ header, footer }: CodePageProps) {
  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Styling"
      title="Per-page CSS"
      intro="This page imports its own page-css.css. Vite bundles it and the renderer links it in the <head>, so the panel below is styled on the first paint — no flash."
    >
      <div className="pgcss-panel">
        <span className="pgcss-kicker">
          <span className="pgcss-dot" />
          Styled by page-css.css
        </span>
        <p className="pgcss-title">A gradient panel, a keyframe, and a custom badge.</p>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        None of the above uses Tailwind — the gradient, the pulsing dot, and the type scale come
        from <code className="font-mono">page-css.css</code> sitting next to this file. Import a CSS
        file from any page and it just works; keep Tailwind for everything it can already do.
      </p>
    </PageShell>
  )
}
