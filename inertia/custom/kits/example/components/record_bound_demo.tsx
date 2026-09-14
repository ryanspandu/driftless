import { PageShell } from './page_shell'
import type { CodePageProps, KitCapability } from '~/custom/types'

/**
 * This sub-template has nothing an operator should touch from the admin — see
 * `index.tsx`'s `resolveCapability`, which returns this for the one demo path
 * below. The real-world version of this is a page bound to a database record
 * (an article/product detail template): every value on screen comes from that
 * record, so there is nothing to compose with the page builder OR fill in a
 * form — the record itself is what you'd edit (in Content, or your store).
 */
export const capability: KitCapability = { kind: 'none' }

export function RecordBoundDemo({ header, footer }: CodePageProps) {
  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Custom template · nothing editable here"
      title="Nothing to edit here"
      intro="A template like this is typically bound to a database record — an article or product detail page, say — so every value on screen comes from that record, not from this page's own settings."
    >
      <div className="rounded-xl border border-border p-5 text-sm leading-relaxed text-muted-foreground">
        Open this page's row menu in <strong className="font-medium text-foreground">Pages</strong>{' '}
        — <strong className="font-medium text-foreground">Edit content region</strong> is greyed
        out, not an empty page builder. Its <code className="font-mono">capability</code> is{' '}
        <code className="font-mono">{"{ kind: 'none' }"}</code>, declared in{' '}
        <code className="font-mono">components/record_bound_demo.tsx</code> and read by{' '}
        <code className="font-mono">index.tsx</code>'s <code className="font-mono">resolveCapability</code>.
      </div>
    </PageShell>
  )
}
