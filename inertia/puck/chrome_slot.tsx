import { createContext, useContext, type ReactNode } from 'react'
import { Render, type Data } from '@measured/puck'
import { puckConfig } from '~/puck/config'
import { getCodeTemplate } from '~/custom/registry'

/**
 * Per-page code header/footer pointers for a code page's `<SiteChrome>`, provided
 * by the renderer. Lets a code page pick up code chrome without the author
 * threading it through — their `<SiteChrome header footer>` reads this.
 */
export const ChromeCodeContext = createContext<{ header?: string | null; footer?: string | null }>(
  {}
)
export const useChromeCode = () => useContext(ChromeCodeContext)

/**
 * A header/footer/layout slot that is either a **builder template** (a Puck
 * document) or a **code template** (a `codetpl:<kit>/<type>` pointer at a kit
 * component). Shared by the builder renderer and the code-page chrome so the two
 * resolve code vs. Puck identically.
 */

function hasBlocks(doc: Record<string, unknown> | undefined | null): boolean {
  if (!doc || !Object.keys(doc).length) return false
  const content = (doc as { content?: unknown }).content
  return !Array.isArray(content) || content.length > 0
}

function toData(doc: Record<string, unknown> | undefined | null): Data {
  return doc && Object.keys(doc).length
    ? (doc as unknown as Data)
    : ({ content: [], root: {} } as unknown as Data)
}

/** Render a header or footer slot — a code component when `code` is set, else the Puck doc. */
export function ChromeSlot({
  code,
  doc,
}: {
  code?: string | null
  doc?: Record<string, unknown> | null
}) {
  if (code) {
    const Component = getCodeTemplate(code)
    if (!Component) return null
    // A build-time glob lookup returns the identical module export every render,
    // so this is stable — not a component created during render (see registry.ts).
    // eslint-disable-next-line react-hooks/static-components
    return <Component />
  }
  return hasBlocks(doc) ? <Render config={puckConfig} data={toData(doc)} /> : null
}

/** Wrap the page content in a code layout; if the pointer misses, render the content bare. */
export function CodeLayout({ code, children }: { code: string; children: ReactNode }) {
  const Component = getCodeTemplate(code)
  if (!Component) return <>{children}</>
  // eslint-disable-next-line react-hooks/static-components
  return <Component>{children}</Component>
}
