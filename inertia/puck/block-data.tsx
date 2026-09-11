import { createContext, useContext, useEffect, useState } from 'react'

/**
 * The channel a server-resolved block gets its data through.
 *
 * Generic on purpose. Core's `PageRenderer` resolves block data through a
 * registry that modules add to — it never knows what a "product" is — so the
 * contexts that carry the result belong to core too. They lived in the
 * e-commerce module for a while because it was the first thing to use them,
 * which meant core imported a module by name to render any page at all.
 */

/**
 * Data resolved server-side, keyed by the same strings the server used.
 *
 * Empty in the builder preview and on CSR pages — there the blocks fetch.
 */
export const BlockDataContext = createContext<Record<string, unknown>>({})

/**
 * What the current URL bound this render to, e.g. `{ slug: 'blue-widget' }`.
 *
 * Lets a block leave its own target blank and inherit the route's, which is
 * what makes one builder page serve every item. Mirrors `BlockRenderContext`
 * on the server — the two must agree on the parameter names.
 */
export const BlockBindingsContext = createContext<Record<string, string>>({})

/** The route's binding for `name`, or empty when this is an ordinary page. */
export function useBinding(name: string): string {
  return useContext(BlockBindingsContext)[name] ?? ''
}

/**
 * Read a key from the server-resolved block data, falling back to a fetch.
 *
 * The fetch only runs when the key is missing from the context — so an SSR/SSG
 * page (which baked the value in) does no client work, while a CSR or builder-
 * preview page (empty context) does exactly one request. A block that cannot
 * load its data renders `null` rather than throwing inside render and taking the
 * page down with it.
 */
export function useBlockData<T>(
  key: string | null,
  fetcher: () => Promise<T>
): { data: T | null; loading: boolean } {
  const preloaded = useContext(BlockDataContext)
  const fromServer = key ? (preloaded[key] as T | undefined) : undefined

  // Only the FETCHED value is state; the server value is derived straight from
  // context and `loading`/`data` are derived below — so nothing is set-state'd
  // synchronously in the effect. `forKey` guards a stale result after the key
  // changes.
  const [fetched, setFetched] = useState<{ forKey: string; data: T | null } | null>(null)

  useEffect(() => {
    if (!key || fromServer !== undefined) return
    let alive = true
    fetcher()
      .then((result) => {
        if (alive) setFetched({ forKey: key, data: result })
      })
      .catch(() => {
        if (alive) setFetched({ forKey: key, data: null })
      })
    return () => {
      alive = false
    }
    // `fetcher` is recreated per render by design; the key is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fromServer])

  const hasFetched = !!fetched && fetched.forKey === key
  const data = fromServer !== undefined ? fromServer : hasFetched ? fetched!.data : null
  const loading = key !== null && fromServer === undefined && !hasFetched
  return { data, loading }
}
