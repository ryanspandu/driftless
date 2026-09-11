import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'

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
    <PageShell
      header={header}
      footer={footer}
      eyebrow="File-page"
      title="Hello from a file-page"
      intro="This whole page is one .tsx file in the kit's pages/ folder — no CMS row behind it. It appears in the admin pages list as a read-only “File page”."
    >
      <p className="text-sm text-muted-foreground">
        Served at <code className="font-mono">/{url}</code> by{' '}
        <code className="font-mono">inertia/custom/kits/example/pages/hello.tsx</code>. See{' '}
        <code className="font-mono">/kit-example/about</code> and{' '}
        <code className="font-mono">/kit-example/pricing</code> for sibling pages sharing the same{' '}
        <code className="font-mono">PageShell</code> component.
      </p>
    </PageShell>
  )
}
