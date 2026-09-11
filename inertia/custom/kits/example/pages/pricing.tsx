import { Check } from '@phosphor-icons/react'
import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'

/** A third file-page — edit the plans right here in pricing.tsx. */
export const path = 'kit-example/pricing'
export const title = 'Pricing (example file-page)'

export default function Pricing({ header, footer }: CodePageProps) {
  const tiers = [
    { name: 'Starter', price: '$0', features: ['1 project', 'Community support'], featured: false },
    {
      name: 'Team',
      price: '$29',
      features: ['Unlimited projects', 'Priority support', 'Analytics'],
      featured: true,
    },
  ]
  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Plans"
      title="Pricing"
      intro="Uses a Phosphor icon and app design tokens, like any kit code. No builder — it's just React in the folder."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={
              t.featured
                ? 'rounded-2xl bg-primary p-6 text-primary-foreground'
                : 'rounded-2xl border border-border bg-card p-6'
            }
          >
            <p className="text-sm font-medium">{t.name}</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {t.price}
              <span
                className={
                  t.featured
                    ? 'text-base text-primary-foreground/70'
                    : 'text-base text-muted-foreground'
                }
              >
                /mo
              </span>
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check weight="bold" className="size-4 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
