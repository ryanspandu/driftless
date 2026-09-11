import { createContext, useContext, type ReactNode } from 'react'

/**
 * PageOutlet block for the Pages builder — the injection point inside a LAYOUT
 * template where the wrapped page's own content is rendered (think Adonis
 * `@!section('body')` / React Router `<Outlet/>`).
 *
 * The public renderer wraps a layout's `<Render>` in `PageOutletContext.Provider`
 * carrying the page's own content node; the layout's `PageOutlet` block reads it.
 */

/** The page's own rendered content, provided by the public renderer to a layout. */
export const PageOutletContext = createContext<ReactNode>(null)

const placeholder =
  'rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'

export function PageOutletView() {
  const outlet = useContext(PageOutletContext)
  if (outlet) return <>{outlet}</>
  return <div className={placeholder}>Page content renders here</div>
}
