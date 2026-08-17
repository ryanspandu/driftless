import { PublicPageFrame } from '~/components/public-page-frame'
import { BuilderRegionContext } from '~/custom/builder-region'
import { customPageSlugs, getCustomPage } from '~/custom/registry'
import type { CodePageEnvelope, CodePageProps } from '~/custom/types'

/**
 * Renders the hand-written component a CODE page names.
 *
 * ## Why the lookup happens here and not in Inertia's resolver
 *
 * The obvious design is to store an Inertia page name on the row and let
 * `inertia.render()` resolve it. This does not do that, for four reasons:
 *
 * 1. **Nothing validates a component name.** `renderPage()` casts it to `never`,
 *    and Inertia's resolver is an exact key lookup that throws inside an async
 *    `resolve` — surfacing as an unhandled rejection and a blank screen, not a
 *    404. That failure is live in this repo today: two announcements
 *    controllers still render `plugins/announcements/*`, which has not existed
 *    since the plugins→modules migration.
 * 2. **A database value would be able to address any page in the app**,
 *    including admin screens. Scoping the glob to one folder makes that
 *    impossible rather than merely discouraged.
 * 3. **SSR stays trivial.** `ssr.pages` is an exact-match array; one wrapper
 *    name keeps it a two-item list instead of needing the per-request function
 *    form.
 * 4. The typed `inertia.render` surface and `pages.d.ts` are left alone.
 *
 * This mirrors how the builder already works: `public/page_ssr` is one Inertia
 * page that renders arbitrary content resolved from data.
 *
 * ## Editable regions
 *
 * A code page may render `<BuilderRegion />`, which is filled by the page's own
 * `content` document — the same column a builder page uses. That is provided
 * here, alongside the block-render contexts, so blocks inside the region behave
 * exactly as they do on a builder page.
 *
 * Slug resolution itself lives in `registry.ts`; see the note there on why the
 * glob is eager.
 */
export function CodePageView({ page }: { page: CodePageEnvelope }) {
  const { component } = page
  const Component = getCustomPage(component)
  // Narrowed explicitly rather than spread: the envelope's plumbing (block
  // data, global code, the region document) is for the frame, not the page.
  const props: CodePageProps = {
    title: page.title,
    path: page.path,
    seo: page.seo,
    globalMeta: page.globalMeta,
    header: page.header,
    footer: page.footer,
    bindings: page.bindings,
    preview: page.preview,
  }
  const rootProps = (page.content?.root as { props?: Record<string, unknown> } | undefined)?.props

  return (
    <PublicPageFrame
      title={page.title}
      seo={page.seo}
      globalMeta={page.globalMeta}
      globalCode={page.globalCode}
      rootProps={rootProps}
      templates={page.templates}
      collections={page.collections}
      blockData={page.blockData}
      bindings={page.bindings}
      preview={page.preview}
    >
      <BuilderRegionContext.Provider
        value={{ content: page.content ?? null, preview: page.preview ?? false }}
      >
        {Component ? (
          /*
            Not a component created during render, despite how it reads to the
            rule: `getCustomPage` is a lookup into a build-time glob, so a given
            slug returns the identical module export every render and React's
            reconciliation — and therefore component state — is stable.
          */
          // eslint-disable-next-line react-hooks/static-components
          <Component {...props} />
        ) : (
          <MissingComponent slug={component} known={customPageSlugs()} />
        )}
      </BuilderRegionContext.Provider>
    </PublicPageFrame>
  )
}

/**
 * Says what is wrong and what to do about it.
 *
 * The realistic way to reach this is deploying a page row that references a file
 * added after the build — the glob is frozen at build time. A blank screen
 * makes that look like a server fault; naming the file it wanted, and listing
 * what does exist, points straight at the rebuild.
 */
function MissingComponent({ slug, known }: { slug: string; known: string[] }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-sm font-semibold">Custom page component not found</p>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is set to render <code className="font-mono">{slug || '(none)'}</code>, but no
        matching file was found at{' '}
        <code className="font-mono">inertia/custom/pages/{slug}.tsx</code> in this build.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {known.length
          ? `Available: ${known.join(', ')}. If you just added the file, rebuild the front end.`
          : 'No custom pages exist in this build yet.'}
      </p>
    </div>
  )
}
