import { createContext, useContext } from 'react'
import { Render, type Data } from '@measured/puck'
import { puckConfig } from '~/puck/config'

/**
 * A builder-editable region inside a hand-written page.
 *
 * The middle ground between the two extremes: you own the structure, the
 * layout and everything around it in React, and one area stays editable in the
 * page builder — so copy, images and blocks can change without a developer or
 * a deploy.
 *
 * Its content is the page's own `content` document, the same column a builder
 * page uses. That is what makes the page builder work on it unchanged: there is
 * no second storage shape, no second editor, and every block — including
 * CollectionList, TemplateRef and the commerce blocks — behaves exactly as it
 * does on a builder page, because the server resolves their data the same way.
 *
 * Declare it on the page module so the admin knows to open the builder:
 *
 * ```tsx
 * export const editableRegion = true
 *
 * export default function About({ title }: CodePageProps) {
 *   return (
 *     <main>
 *       <h1>{title}</h1>
 *       <BuilderRegion />
 *     </main>
 *   )
 * }
 * ```
 *
 * One region per page. A page needing two independently editable areas is
 * better served by two pages, or by dropping a Template Reference block inside
 * the one region.
 */

const EMPTY: Data = { content: [], root: {} } as unknown as Data

export interface BuilderRegionValue {
  content: Record<string, unknown> | null
  /** Admin preview — the only place the empty-state hint should appear. */
  preview: boolean
}

export const BuilderRegionContext = createContext<BuilderRegionValue>({
  content: null,
  preview: false,
})

function toData(doc: Record<string, unknown> | null): Data {
  return doc && Object.keys(doc).length ? (doc as unknown as Data) : EMPTY
}

/** True when the document has no blocks to render. */
function isEmpty(doc: Record<string, unknown> | null): boolean {
  if (!doc || !Object.keys(doc).length) return true
  const content = (doc as { content?: unknown }).content
  return Array.isArray(content) && content.length === 0
}

export function BuilderRegion({
  placeholder = 'This area is editable in the page builder.',
}: {
  /** Empty-state hint, shown in the admin preview only. */
  placeholder?: string
}) {
  const { content, preview } = useContext(BuilderRegionContext)

  if (isEmpty(content)) {
    /**
     * A visitor sees nothing. Rendering "this area is editable in the page
     * builder" on the live site would advertise an editor they cannot open, in
     * a dashed box that reads as a broken image — so the hint is scoped to the
     * admin preview, where it is genuinely useful.
     */
    if (!preview) return null
    return (
      <div
        data-builder-region="empty"
        className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground"
      >
        {placeholder}
      </div>
    )
  }

  return <Render config={puckConfig} data={toData(content)} />
}
