import { BuilderRegion } from '~/custom/builder-region'
import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps } from '~/custom/types'
import { Hero } from './components/hero'
import './style/style.css'

/**
 * Opt into a builder-editable region — read by the admin so it opens the page
 * builder instead of the "built in code" notice. Remove it to be fully
 * code-owned.
 */
export const editableRegion = true

/**
 * Reference custom-template kit.
 *
 * Copy this whole folder, rename it (the folder name is the id — a page points
 * at it with `component = "kit:<folder>"`), and edit index.tsx. See the README
 * in `inertia/custom/kits/` for the full contract. Adding or renaming a kit
 * needs a front-end rebuild, because the lookup is a build-time glob.
 */
export default function ExampleKit({ title, path, header, footer }: CodePageProps) {
  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-3xl px-6 py-20">
        <Hero title={title} path={path} />

        <div className="mt-8 rounded-xl border border-border p-5 text-sm leading-relaxed text-muted-foreground">
          This page is a{' '}
          <strong className="font-medium text-foreground">custom template kit</strong> — every pixel
          comes from <code className="font-mono">inertia/custom/kits/example/</code>, not the page
          builder. It can use React, Tailwind, and anything in the app&apos;s UI kit.
        </div>

        {/* Everything inside this region is editable in the page builder, so copy
            and imagery can change without a developer or a deploy. */}
        <div className="mt-10">
          <BuilderRegion placeholder="Open this page in the builder to fill this region." />
        </div>
      </main>
    </SiteChrome>
  )
}
