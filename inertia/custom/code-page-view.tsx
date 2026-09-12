import type { ReactNode } from 'react'
import { PublicPageFrame } from '~/components/public-page-frame'
import { ChromeCodeContext } from '~/puck/chrome_slot'
import { BuilderRegionContext } from '~/custom/builder-region'
import { customPageSlugs, getCustomPage, isKitIsolated, kitIdOf } from '~/custom/registry'
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
 *    404. A controller that renders a stale name — e.g. a `plugins/<name>/*`
 *    path left over from the plugins→modules migration — fails exactly this way.
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
    record: page.record,
    preview: page.preview,
  }
  const rootProps = (page.content?.root as { props?: Record<string, unknown> } | undefined)?.props

  return (
    <PublicPageFrame
      title={page.title}
      seo={page.seo}
      blockCss={page.blockCss}
      globalMeta={page.globalMeta}
      globalCode={page.globalCode}
      rootProps={rootProps}
      templates={page.templates}
      collections={page.collections}
      blockData={page.blockData}
      bindings={page.bindings}
      preview={page.preview}
    >
      <ChromeCodeContext.Provider value={{ header: page.codeHeader, footer: page.codeFooter }}>
        <BuilderRegionContext.Provider
          value={{ content: page.content ?? null, preview: page.preview ?? false }}
        >
          <KitScope component={component}>
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
          </KitScope>
        </BuilderRegionContext.Provider>
      </ChromeCodeContext.Provider>
    </PublicPageFrame>
  )
}

/**
 * Wraps an isolated kit's body in the scope root (`kit-<id>`) that the
 * build-time `@scope (.kit-<id>)` transform (see `scopeIsolatedKitCss` in
 * `vite.config.ts`) targets — so the kit's CSS stays confined to this subtree
 * and the app's base styles are reverted inside it. A no-op for non-isolated
 * kits and single-file code pages, so it never changes their DOM.
 */
function KitScope({ component, children }: { component: string; children: ReactNode }) {
  const kitId = kitIdOf(component)
  if (!kitId || !isKitIsolated(kitId)) return <>{children}</>
  return <div className={`kit-scope kit-${kitId}`}>{children}</div>
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
  // A `kit:<id>` pointer resolves to a folder's index.tsx; a plain slug to a
  // single file — name whichever one the operator needs to add and rebuild.
  const expectedPath = slug.startsWith('kit:')
    ? `inertia/custom/kits/${slug.slice('kit:'.length)}/index.tsx`
    : `inertia/custom/pages/${slug}.tsx`
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <p className="text-sm font-semibold">Custom page component not found</p>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is set to render <code className="font-mono">{slug || '(none)'}</code>, but no
        matching file was found at <code className="font-mono">{expectedPath}</code> in this build.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {known.length
          ? `Available: ${known.join(', ')}. If you just added the file, rebuild the front end.`
          : 'No custom pages exist in this build yet.'}
      </p>
    </div>
  )
}
