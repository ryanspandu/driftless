import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps } from '~/custom/types'

/**
 * A file-page: this file IS a route. It lives in the kit folder with no database
 * row — add or edit pages by editing files in `pages/`, then rebuild.
 *
 * `path` overrides the filename-derived default (which would be `/hello`); it is
 * namespaced under `/kit-example/` so the shipped example never shadows a real
 * page. `title` overrides the titleized filename. Copy this file, drop the two
 * overrides, and the route becomes `/<filename>` titled after the file.
 */
export const path = 'kit-example/hello'
export const title = 'Hello from a file-page'

export default function Hello({ path: url, header, footer }: CodePageProps) {
  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-2xl px-6 py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">File-page</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Hello from a file-page
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
          Served at <code className="font-mono">/{url}</code> by{' '}
          <code className="font-mono">inertia/custom/kits/example/pages/hello.tsx</code> — no CMS
          row behind it. It shows up in the admin pages list as a read-only “File page”.
        </p>
      </main>
    </SiteChrome>
  )
}
