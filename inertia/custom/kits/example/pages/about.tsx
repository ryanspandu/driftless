import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'

/** A sibling file-page, sharing PageShell with hello.tsx and pricing.tsx. */
export const path = 'kit-example/about'
export const title = 'About (example file-page)'

export default function About({ header, footer }: CodePageProps) {
  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Company"
      title="About"
      intro="A second file-page in the same folder. Editing this file changes /kit-example/about — no builder, no database row."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { k: '2019', v: 'Founded' },
          { k: '40+', v: 'People' },
          { k: '3', v: 'Continents' },
        ].map((s) => (
          <div key={s.v} className="rounded-xl border border-border bg-card p-5">
            <p className="text-2xl font-semibold text-foreground">{s.k}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.v}</p>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
