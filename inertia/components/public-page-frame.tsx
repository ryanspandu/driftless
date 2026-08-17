import { useEffect, type ReactNode } from 'react'
import { puckConfig } from '~/puck/config'
import { CollectionDataContext, type CmsRecord } from '~/puck/collection-list'
import { PuckConfigContext, TemplateContext } from '~/puck/template-ref'
import { BlockBindingsContext, BlockDataContext } from '~/puck/block-data'
import { cssFromSnippets, jsSnippets, readSnippets, type CodeSnippet } from '~/puck/custom-code'
import { PublicPageHead, type MetaTag } from '~/components/public-page-head'

/**
 * Everything a public page gets regardless of how its body was authored.
 *
 * Shared by the builder renderer and the code-page renderer, because the two
 * had already drifted: a code page emitted no site-wide CSS and ran no
 * site-wide JS, so the analytics and pixel scripts configured in Website
 * Settings simply did not fire on those URLs. Nothing errored — the numbers
 * were just quietly incomplete, which is the worst way for that to fail.
 *
 * Keeping it in one component is what stops the two paths drifting again.
 */
export interface PublicPageFrameProps {
  title: string
  seo?: Record<string, unknown>
  globalMeta?: MetaTag[]
  /** Site-wide snippets from Website Settings. */
  globalCode?: CodeSnippet[]
  /**
   * The page's Puck root props, holding its own CSS/JS snippets.
   *
   * A code page passes these too: it may have no block tree, but it can still
   * carry per-page custom code, and Page Settings is where an operator expects
   * to find that.
   */
  rootProps?: Record<string, unknown>
  /** Server-resolved data for any blocks rendered inside. */
  templates?: Record<string, Record<string, unknown>>
  collections?: Record<string, CmsRecord[]>
  blockData?: Record<string, unknown>
  bindings?: Record<string, string>
  preview?: boolean
  children: ReactNode
}

export function PublicPageFrame({
  title,
  seo,
  globalMeta,
  globalCode,
  rootProps,
  templates,
  collections,
  blockData,
  bindings,
  preview,
  children,
}: PublicPageFrameProps) {
  const globalSnippets: CodeSnippet[] = Array.isArray(globalCode) ? globalCode : []
  const globalCss = cssFromSnippets(globalSnippets)

  /**
   * Custom JS runs only here on the public page — never in the editor. Each
   * snippet becomes a real `<script>` so it executes under SSR and CSR alike.
   * Site-wide snippets run before the page's own.
   */
  const allJs = [...jsSnippets(globalSnippets), ...jsSnippets(readSnippets(rootProps))]
  // Re-run only when the snippet set/source actually changes (the array
  // identity differs every render).
  const jsKey = allJs.map((s) => `${s.id}:${s.code}`).join(' ')
  useEffect(() => {
    if (!allJs.length) return
    const els = allJs.map((s) => {
      const el = document.createElement('script')
      el.setAttribute('data-page-custom-js', s.id)
      el.textContent = s.code
      document.body.appendChild(el)
      return el
    })
    return () => {
      for (const el of els) el.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsKey])

  return (
    <>
      <PublicPageHead title={title} seo={seo} globalMeta={globalMeta} />
      {globalCss ? (
        <style data-global-css="" dangerouslySetInnerHTML={{ __html: globalCss }} />
      ) : null}
      {/* Config first: a TemplateRef needs it to render server-side at all. */}
      <PuckConfigContext.Provider value={puckConfig}>
        <TemplateContext.Provider value={templates ?? {}}>
          <CollectionDataContext.Provider value={collections ?? {}}>
            <BlockDataContext.Provider value={blockData ?? {}}>
              <BlockBindingsContext.Provider value={bindings ?? {}}>
                {children}
              </BlockBindingsContext.Provider>
            </BlockDataContext.Provider>
          </CollectionDataContext.Provider>
        </TemplateContext.Provider>
      </PuckConfigContext.Provider>
      {preview ? <PreviewBadge /> : null}
    </>
  )
}

function PreviewBadge() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        pointerEvents: 'none',
      }}
      className="flex justify-center p-2"
    >
      <span className="rounded-full bg-amber-400/40 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm backdrop-blur-sm">
        Preview · not published
      </span>
    </div>
  )
}
