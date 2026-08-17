import { BuilderRegion } from '~/custom/builder-region'
import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps } from '~/custom/types'

/**
 * Declares that this page renders a `<BuilderRegion />`.
 *
 * Read by the admin so it opens the page builder on this page instead of the
 * "built in code" notice. Remove it and the page becomes fully code-owned.
 */
export const editableRegion = true

/**
 * Reference implementation for a hand-written page.
 *
 * Copy this file, rename it, and point a CODE page at the new slug — the
 * filename **is** the slug (`playground.tsx` → `playground`). Delete this one
 * once you have your own; it exists so the mechanism has something to prove
 * itself against.
 *
 * Everything ordinary React can do applies here: hooks, imports, `~/components`,
 * Tailwind, TanStack Query. The only rule is that adding or renaming a file in
 * this folder needs a front-end rebuild, because the lookup is a build-time glob.
 */
export default function Playground({ title, path, header, footer }: CodePageProps) {
  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-3xl px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Code page
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Rendered by <code className="font-mono">inertia/custom/pages/playground.tsx</code>, served
          at <code className="font-mono">/{path}</code>. There is no Puck document behind this page
          — the CMS row supplies the path, publish state and SEO, and this component supplies every
          pixel.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          The header and footer above and below come from the site templates, rendered through{' '}
          <code className="font-mono">&lt;SiteChrome&gt;</code>. Drop that wrapper to own the whole
          viewport instead.
        </p>

        {/*
          Everything above is fixed in code. Everything inside this region is
          edited in the page builder — so copy and imagery can change without a
          developer or a deploy.
        */}
        <div className="mt-10">
          <BuilderRegion placeholder="Open this page in the builder to fill this region." />
        </div>
      </main>
    </SiteChrome>
  )
}
